'use client';

import { Button } from '@repo/design-system/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/design-system/components/ui/dropdown-menu';
import { Languages } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';

const languages = [
  { label: 'US (English)', value: 'en-US' },
  { label: 'CA (English)', value: 'en-CA' },
  { label: 'CA (Français)', value: 'fr-CA' },
];

export const LanguageSwitcher = () => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const switchLanguage = (locale: string) => {
    const defaultLocale = 'en-US';
    let newPathname = pathname;

    // Case 1: If current locale is default and missing from the URL
    if (!pathname.startsWith(`/${params.locale}`) && params.locale === defaultLocale) {
      // Add the default locale to the beginning to normalize
      newPathname = `/${params.locale}${pathname}`;
    }

    // Replace current locale with the selected one
    newPathname = newPathname.replace(`/${params.locale}`, `/${locale}`);
    console.log(newPathname);

    router.push(newPathname);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="shrink-0 text-foreground" variant="tertiary">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Switch language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {languages.map(({ label, value }) => (
          <DropdownMenuItem key={value} onClick={() => switchLanguage(value)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
