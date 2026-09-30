import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { useRef } from "react";

import styles from "./search-field.module.css";

export function SearchQuery({
  label,
  query,
  refine,
}: {
  readonly label: string;
  readonly query: string;
  readonly refine: (query: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.form}>
      <span aria-hidden="true" className={styles.searchIcon} />
      <Input
        aria-label={label}
        className={styles.input}
        onChange={(event) => {
          refine(event.currentTarget.value);
        }}
        placeholder={label}
        ref={inputRef}
        type="search"
        value={query}
      />
      <Button
        aria-label="Clear search"
        className={styles.clearButton}
        hidden={query.length === 0}
        onClick={() => {
          refine("");
          inputRef.current?.focus();
        }}
        type="button"
        variant="ghost"
      />
    </div>
  );
}
