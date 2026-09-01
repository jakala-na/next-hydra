export interface CompanyMemberName {
  readonly firstName: string;
  readonly lastName: string;
}

export const parseCompanyMemberName = (value: string): CompanyMemberName => {
  const [firstName, ...lastNameParts] = value.trim().split(/\s+/u);
  const lastName = lastNameParts.join(" ");
  if (firstName === undefined || lastName === "") {
    throw new Error(`A Company Member needs a first and last name: ${value}`);
  }
  return { firstName, lastName };
};
