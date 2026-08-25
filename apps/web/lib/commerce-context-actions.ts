"use server";

import { Schema } from "effect";

import { Actions } from "./actions";
import {
  SelectBusinessUnitActionError,
  SelectBusinessUnitInput,
  selectBusinessUnitProgram,
} from "./commerce-context-procedures";

const selectBusinessUnitProcedure = Actions.procedure(
  "BuyingContext.selectBusinessUnit"
)
  .input(SelectBusinessUnitInput)
  .output(Schema.Null)
  .error(SelectBusinessUnitActionError)
  .handle(selectBusinessUnitProgram);

const selectBusinessUnitAction = selectBusinessUnitProcedure.toAction();

export const selectBusinessUnit = async (
  businessUnitId: string
): Promise<void> => {
  await selectBusinessUnitAction(businessUnitId);
};
