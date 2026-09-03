import type { Schema } from "effect";

import type { CustomFieldsDraft, CustomFieldsWritePlan } from "./builder";

export type RestCustomFieldsDraft = {
  readonly fields: Readonly<Record<string, Schema.Json>>;
  readonly type: {
    readonly key: string;
    readonly typeId: "type";
  };
};

export type RestCustomFieldsUpdateAction =
  | {
      readonly action: "setCustomType";
      readonly fields: Readonly<Record<string, Schema.Json>>;
      readonly type: {
        readonly key: string;
        readonly typeId: "type";
      };
    }
  | {
      readonly action: "setCustomField";
      readonly name: string;
      readonly value: Schema.Json;
    };

export const toRestDraft = (
  draft: CustomFieldsDraft
): RestCustomFieldsDraft => ({
  fields: draft.fields,
  type: { key: draft.typeKey, typeId: "type" },
});

export const toRestUpdateActions = (
  plan: CustomFieldsWritePlan
): readonly RestCustomFieldsUpdateAction[] => {
  switch (plan._tag) {
    case "NoChange": {
      return [];
    }
    case "SetType": {
      return [
        {
          action: "setCustomType",
          fields: plan.fields,
          type: { key: plan.typeKey, typeId: "type" },
        },
      ];
    }
    case "PatchFields": {
      return plan.changes.map((change) => ({
        action: "setCustomField" as const,
        name: change.name,
        value: change._tag === "Set" ? change.value : null,
      }));
    }
    default: {
      return plan;
    }
  }
};
