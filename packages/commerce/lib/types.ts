export type Channel = {
  id: string;
  key: string;
  version: number;
  name: string | null;
};

export type Country = {
  code: string;
};

export type Store = {
  id: string;
  key: string;
  version: number;
  name: string | null;
  languages: string[] | null;
  countries: Country[] | null;
  distributionChannels: Channel[];
  supplyChannels: Channel[];
};
