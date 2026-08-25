import { Calendar } from "@repo/design-system/components/ui/calendar";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { addDays } from "date-fns";
import { action } from "storybook/actions";

/**
 * A date field component that allows users to enter and edit date.
 */
const meta = {
  argTypes: {},
  args: {
    className: "rounded-md border w-fit",
    mode: "single",
    onSelect: action("onDayClick"),
    selected: new Date(),
  },
  component: Calendar,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "ui/Calendar",
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the calendar.
 */
export const Default: Story = {};

/**
 * Use the `multiple` mode to select multiple dates.
 */
export const Multiple: Story = {
  args: {
    min: 1,
    mode: "multiple",
    selected: [new Date(), addDays(new Date(), 2), addDays(new Date(), 8)],
  },
};

/**
 * Use the `range` mode to select a range of dates.
 */
export const Range: Story = {
  args: {
    mode: "range",
    selected: {
      from: new Date(),
      to: addDays(new Date(), 7),
    },
  },
};

/**
 * Use the `disabled` prop to disable specific dates.
 */
export const Disabled: Story = {
  args: {
    disabled: [
      addDays(new Date(), 1),
      addDays(new Date(), 2),
      addDays(new Date(), 3),
      addDays(new Date(), 5),
    ],
  },
};

/**
 * Use the `numberOfMonths` prop to display multiple months.
 */
export const MultipleMonths: Story = {
  args: {
    numberOfMonths: 2,
    showOutsideDays: false,
  },
};
