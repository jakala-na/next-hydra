import { HeroSection as HeroSectionComponent } from "@repo/design-system/components/cms/blocks/hero-section";
import { renderToHtml } from "@uniformdev/richtext";
import  { transformLocale } from "@repo/cms/lib/utils/transform-locale";
import type { Locale } from "@repo/i18n";

export function HeroSection(
  props: {
    data: any
    locale: Locale
  }
) {
  const { data, locale } = props;
  const localeCode = transformLocale(locale);
  const imageProps = {
    url: data.image.locales[localeCode][0].fields.url.value,
    altText: data.image.locales[localeCode][0].fields.title.value,
    width: data.image.locales[localeCode][0].fields.width.value,
    height: data.image.locales[localeCode][0].fields.height.value,
  };
  const title = props.data.title.locales[localeCode] ?? '';
  const tagline = props.data.tagline.locales[localeCode] ?? '';
  const description = renderToHtml(props.data.description.locales[localeCode]);
  
  return (
    <HeroSectionComponent
      image={imageProps}
      ctaLinks={[]}
      tagline={tagline}
      title={title}
      description={description}
    />
  );
}

