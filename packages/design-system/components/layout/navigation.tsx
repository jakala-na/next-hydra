import { DynamicIcon, type IconName } from "lucide-react/dynamic";
import Link from "next/link";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../ui/navigation-menu";
export type NavigationItem = {
  title: string;
  href?: string;
  children?: {
    title: string;
    description?: string;
    href: string;
    icon?: NavigationItemIcon;
  }[];
};
export type NavigationItemIcon = IconName;
export type NavigationProps = {
  navigationItems: NavigationItem[];
};

export function Navigation({ navigationItems }: NavigationProps) {
  if (navigationItems.length === 0) {
    return null;
  }
  return (
    <nav className="hidden items-center lg:flex">
      <NavigationMenu>
        <NavigationMenuList>
          {navigationItems.map((item) => {
            const hasChildren =
              Array.isArray(item.children) && item.children.length > 0;

            if (hasChildren) {
              return (
                <NavigationMenuItem key={item.title}>
                  <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="w-[400px] p-2">
                      {item.children?.map((child) => (
                        <NavigationMenuLink asChild key={child.href}>
                          <Link
                            href={child.href}
                            className="group flex select-none gap-4 rounded-md p-3 leading-none no-underline outline-none transition-all hover:bg-neutral-100"
                          >
                            <div className="text-foreground transition-colors group-hover:text-primary">
                              {child.icon && <DynamicIcon name={child.icon} />}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground text-sm">
                                {child.title}
                              </div>
                              {child.description && (
                                <p className="text-muted-foreground text-sm leading-snug">
                                  {child.description}
                                </p>
                              )}
                            </div>
                          </Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              );
            }

            if (item.href) {
              return (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    href={item.href}
                    className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 font-medium text-sm transition-colors hover:bg-neutral-100 hover:text-foreground focus:bg-neutral-100 focus:text-foreground focus:outline-none"
                  >
                    {item.title}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            }

            return null;
          })}
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
