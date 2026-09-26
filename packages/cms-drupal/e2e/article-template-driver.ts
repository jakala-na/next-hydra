import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect } from "@repo/e2e-testing";
import type { Page } from "@repo/e2e-testing";
import { z } from "zod";

const drupalDirectory = fileURLToPath(
  new URL("../../../apps/drupal", import.meta.url)
);
const controlFile = new URL("fixtures/article-templates.php", import.meta.url);
let siteUrl: string | undefined;

export async function isDrupalSelected(): Promise<boolean> {
  const file = await readFile(
    new URL("../../../apps/web/package.json", import.meta.url),
    "utf-8"
  );
  const application = z
    .object({
      dependencies: z.object({ "@repo/cms": z.string() }),
    })
    .parse(JSON.parse(file));
  return (
    application.dependencies["@repo/cms"] === "workspace:@repo/cms-drupal@*"
  );
}

// oxlint-disable-next-line typescript/strict-void-return -- Node's execFile supplies its own promisify implementation and returns a child-process handle.
const execute = promisify(execFile);
async function ddev(args: string[]): Promise<string> {
  const { stdout } = await execute("ddev", args, {
    cwd: drupalDirectory,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

async function getSiteUrl(): Promise<string> {
  if (!siteUrl) {
    const stdout = await ddev(["describe", "--json-output"]);
    siteUrl = z
      .object({ raw: z.object({ primary_url: z.string().url() }) })
      .parse(JSON.parse(stdout)).raw.primary_url;
  }
  return siteUrl;
}

const articleSchema = z.object({
  bodyHeading: z.string().min(1),
  fingerprint: z.string(),
  id: z.number().int(),
  path: z.string(),
  summary: z.string(),
  title: z.string(),
});
type Article = z.infer<typeof articleSchema>;
const articlesSchema = z.array(articleSchema).length(3);
const assertionSchema = z.object({ assertion: z.string() });
type ControlOperation =
  | "inspect"
  | "stage-template"
  | "publish-template"
  | "create-draft"
  | "cleanup";
interface ControlInput {
  nodeId?: number;
  notice?: string;
  uuid?: string;
}

async function control<Result>(
  operation: ControlOperation,
  schema: z.ZodType<Result>,
  input: ControlInput = {}
): Promise<Result> {
  const file = await readFile(controlFile, "utf-8");
  const source = file.replace(/^<\?php\s*/u, "");
  const encodedInput = Buffer.from(JSON.stringify(input)).toString("base64");
  const code = `$operation = '${operation}'; $input = json_decode(base64_decode('${encodedInput}'), TRUE, flags: JSON_THROW_ON_ERROR); ${source}`;
  const encodedCode = Buffer.from(code).toString("base64");
  const stdout = await ddev([
    "drush",
    `--uri=${await getSiteUrl()}`,
    "php:eval",
    `eval(base64_decode('${encodedCode}'));`,
  ]);
  return schema.parse(JSON.parse(stdout));
}

export class ArticleTemplateDriver {
  readonly uuid = randomUUID();
  readonly notice = `Shared equipment advice ${this.uuid}`;
  private readonly page: Page;
  private articles: Article[] = [];
  private articleTabs: { article: Article; page: Page }[] = [];
  private draftArticle?: Article;
  private draftAssertion?: string;
  private changedSite = false;

  constructor(page: Page) {
    this.page = page;
  }

  async loadArticles(): Promise<void> {
    this.articles = await control("inspect", articlesSchema);
  }

  async readArticles(): Promise<void> {
    this.articleTabs = await Promise.all(
      this.articles.map(async (article) => {
        const page = await this.page.context().newPage();
        await page.goto(article.path);
        return { article, page };
      })
    );
  }

  private static async expectArticle(
    page: Page,
    article: Article,
    withImage: boolean
  ): Promise<void> {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      article.title
    );
    const content = page.locator("article");
    await expect(
      content.getByText(article.summary, { exact: true })
    ).toBeVisible();
    await expect(
      content.getByRole("heading", { level: 2, name: article.bodyHeading })
    ).toBeVisible();
    if (withImage) {
      const image = content.locator("img");
      await expect(image).toBeVisible();
      await expect
        .poll(
          async () =>
            await image.evaluate(
              (element: HTMLImageElement) => element.naturalWidth
            )
        )
        .toBeGreaterThan(0);
    }
  }

  async expectArticleContent(): Promise<void> {
    await Promise.all(
      this.articleTabs.map(async ({ article, page }) => {
        await ArticleTemplateDriver.expectArticle(page, article, true);
      })
    );
  }

  private static async expectSiteRegions(page: Page): Promise<void> {
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(
      page.getByText("Global pre-header region", { exact: true })
    ).toHaveCount(1);
    await expect(
      page.getByText("Global post-footer region", { exact: true })
    ).toHaveCount(1);
  }

  async expectArticleRegions(): Promise<void> {
    await Promise.all(
      this.articleTabs.map(async ({ page }) => {
        await ArticleTemplateDriver.expectSiteRegions(page);
      })
    );
  }

  private async openPreview(assertion: string): Promise<void> {
    // Exercise the real assertion exchange and share its draft cookies with the browser.
    const response = await this.page.context().request.get("/api/draft", {
      maxRedirects: 0,
      params: { assertion },
    });
    expect(response.status()).toBe(307);
    const destination = response.headers().location;
    if (!destination) {
      throw new Error(
        "The Canvas preview did not provide a redirect destination."
      );
    }
    await this.page.goto(destination);
  }

  async previewNotice(): Promise<void> {
    const [first] = this.articles;
    if (!first) {
      throw new Error("Load the starter articles first.");
    }
    this.changedSite = true;
    const { assertion } = await control("stage-template", assertionSchema, {
      nodeId: first.id,
      notice: this.notice,
      uuid: this.uuid,
    });
    await this.openPreview(assertion);
    await expect(
      this.page.getByText(this.notice, { exact: true })
    ).toBeVisible();
  }

  async expectNoticePrivate(): Promise<void> {
    const browser = this.page.context().browser();
    if (!browser) {
      throw new Error("The preview scenario needs a browser instance.");
    }
    const visitor = await browser.newContext({
      baseURL: new URL(this.page.url()).origin,
      ignoreHTTPSErrors: true,
    });
    try {
      await Promise.all(
        this.articles.map(async (article) => {
          const response = await visitor.request.get(article.path);
          expect(response.status()).toBe(200);
          expect(await response.text()).not.toContain(this.notice);
        })
      );
    } finally {
      await visitor.close();
    }
  }

  async publishTemplate(): Promise<void> {
    await control("publish-template", z.object({ published: z.literal(true) }));
    await this.page.context().clearCookies();
  }

  async expectPublishedNotice(): Promise<void> {
    await Promise.all(
      this.articleTabs.map(async ({ article, page }) => {
        await page.goto(article.path);
        await expect(
          page.getByText(this.notice, { exact: true })
        ).toBeVisible();
        await ArticleTemplateDriver.expectArticle(page, article, true);
        await ArticleTemplateDriver.expectSiteRegions(page);
      })
    );
    expect(await control("inspect", articlesSchema)).toEqual(this.articles);
  }

  async createDraft(): Promise<void> {
    this.changedSite = true;
    const result = await control(
      "create-draft",
      z.object({ article: articleSchema, assertion: z.string() }),
      { uuid: this.uuid }
    );
    this.draftArticle = result.article;
    this.draftAssertion = result.assertion;
  }

  async previewFrenchDraft(): Promise<void> {
    if (!this.draftAssertion) {
      throw new Error("Create the unpublished article first.");
    }
    await this.openPreview(this.draftAssertion);
  }

  async expectFrenchDraft(): Promise<void> {
    if (!this.draftArticle) {
      throw new Error("Create the unpublished article first.");
    }
    await ArticleTemplateDriver.expectArticle(
      this.page,
      this.draftArticle,
      false
    );
    await ArticleTemplateDriver.expectSiteRegions(this.page);
    await expect(this.page.locator("html")).toHaveAttribute("lang", "fr-FR");
    await expect(
      this.page.getByText("1 janvier 2026", { exact: true })
    ).toBeVisible();
  }

  async expectDraftPrivate(): Promise<void> {
    if (!this.draftArticle) {
      throw new Error("Create the unpublished article first.");
    }
    await this.page.context().clearCookies();
    await this.page.goto(this.draftArticle.path);
    await expect(
      this.page.getByRole("heading", {
        level: 1,
        name: this.draftArticle.title,
      })
    ).toHaveCount(0);
    await expect(
      this.page.getByText(this.draftArticle.summary, { exact: true })
    ).toHaveCount(0);
  }

  async dispose(): Promise<void> {
    if (this.changedSite) {
      await control("cleanup", z.object({ cleaned: z.literal(true) }), {
        uuid: this.uuid,
      });
    }
  }
}
