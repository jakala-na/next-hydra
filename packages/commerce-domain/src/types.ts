export type CartProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage: Image;
};

export type CartItem = {
  id: string | undefined;
  quantity: number;
  cost: {
    totalAmount: Money;
  };
  merchandise: {
    id: string;
    title: string;
    product: CartProduct;
  };
};

export type Image = {
  url: string;
  altText: string;
};

export type Money = {
  amount: string;
  currencyCode: string;
};

export type ProductOptionType = 'text' | 'enum';

export type ProductOptionTextValue = {
  value: string;
};

export type ProductOptionEnumValue = {
  label: string;
  value: string;
};

export type ProductOptionValueByType<T extends ProductOptionType> =
  T extends 'enum'
    ? ProductOptionEnumValue
    : T extends 'text'
      ? ProductOptionTextValue
      : never;

export type ProductOption<T extends ProductOptionType = ProductOptionType> = {
  key: string;
  label: string;
  type: T;
  values: ProductOptionValueByType<T>[];
};

export type ProductVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  selectedOptions: {
    name: string;
    value: string;
  }[];
  price: Money;
};

export type SEO = {
  title: string;
  description: string;
  searchable: boolean;
};

export type Cart = {
  id: string | undefined;
  checkoutUrl: string;
  cost: {
    subtotalAmount: Money;
    totalAmount: Money;
    totalTaxAmount: Money;
  };
  lines: CartItem[];
  totalQuantity: number;
};

export type Collection = {
  handle: string;
  title: string;
  description: string;
  seo: SEO;
  updatedAt: string;
};

export type ProductCard = {
  id: string;
  slug?: string;
  featuredImage?: Image;
  title: string;
  description?: string;
  priceFrom?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
};

export type ProductDetails = {
  id: string;
  slug?: string;
  title: string;
  availableForSale: boolean;
  description: string;
  options: ProductOption[];
  variants: ProductVariant[];
  images?: Image[];
  seo: SEO;
  updatedAt: string | undefined | null;
};
