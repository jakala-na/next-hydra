import type { CustomFieldsDraft, CustomFieldsWritePlan } from "./builder";

export type GraphqlCustomFieldInput = {
  readonly name: string;
  readonly value: string;
};

export type GraphqlSetCustomFieldInput = {
  readonly name: string;
  readonly value: string | null;
};

export type GraphqlCustomFieldsDraft = {
  readonly fields: GraphqlCustomFieldInput[];
  readonly typeKey: string;
};

export type GraphqlCustomFieldsUpdateAction =
  | {
      readonly setCustomType: GraphqlCustomFieldsDraft;
    }
  | {
      readonly setCustomField: GraphqlSetCustomFieldInput;
    };

const fieldInputs = (
  fields: CustomFieldsDraft["fields"]
): GraphqlCustomFieldInput[] =>
  Object.entries(fields).map(([name, value]) => ({
    name,
    value: JSON.stringify(value),
  }));

export const toGraphqlDraft = (
  draft: CustomFieldsDraft
): GraphqlCustomFieldsDraft => ({
  fields: fieldInputs(draft.fields),
  typeKey: draft.typeKey,
});

export const toGraphqlUpdateActions = (
  plan: CustomFieldsWritePlan
): GraphqlCustomFieldsUpdateAction[] => {
  switch (plan._tag) {
    case "NoChange": {
      return [];
    }
    case "SetType": {
      return [
        {
          setCustomType: {
            fields: fieldInputs(plan.fields),
            typeKey: plan.typeKey,
          },
        },
      ];
    }
    case "PatchFields": {
      return plan.changes.map((change) => ({
        setCustomField: {
          name: change.name,
          value: change._tag === "Set" ? JSON.stringify(change.value) : null,
        },
      }));
    }
    default: {
      return plan;
    }
  }
};
