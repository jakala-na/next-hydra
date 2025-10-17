import { Facebook, Linkedin, Twitter, Youtube } from "lucide-react";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container px-4 py-16 md:px-6 lg:px-8">
        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2">
            <div className="mb-4 flex items-center space-x-2">
              <div className="h-8 w-8 rounded bg-primary" />
              <span className="font-bold text-xl">TitanMach</span>
            </div>
            <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
              Leading manufacturer of heavy machinery for industrial
              applications worldwide.
            </p>
            <div className="flex gap-3">
              <Link
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Facebook className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Twitter className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Linkedin className="h-4 w-4" />
              </Link>
              <Link
                href="#"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <Youtube className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Products</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Excavators
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Bulldozers
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Cranes
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Loaders
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Solutions</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Construction
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Mining
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Infrastructure
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Manufacturing
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Support</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Service Centers
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Parts & Service
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Training
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Company</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Careers
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  News
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-primary"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row">
          <p className="text-muted-foreground text-sm">
            © 2025 TitanMach Industries. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              Terms of Service
            </Link>
            <Link
              href="#"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
