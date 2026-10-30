/** Author content beside its command or provider; render it centrally. */
export interface NextTask {
  readonly id: string;
  readonly title: string;
  readonly where: string;
  readonly detail: string;
  readonly commands?: readonly string[];
  readonly verify?: string;
}

export interface ReportSection {
  readonly title: string;
  readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface CommandReport {
  /** A provider title frames the receipt and its follow-up instructions together. */
  readonly title?: string;
  readonly outcome: "ready" | "action-required" | "plan";
  readonly summary: string;
  readonly sections: readonly ReportSection[];
  readonly tasks: readonly NextTask[];
  readonly notes?: readonly string[];
}

export interface ProgressStep {
  readonly group: string;
  readonly title: string;
  /** Interactive operations retain durable progress but do not start Ora. */
  readonly interactive?: boolean;
}
