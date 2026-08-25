import { Progress } from "@repo/design-system/components/ui/progress";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Displays an indicator showing the completion progress of a task, typically
 * displayed as a progress bar.
 */
const meta = {
  argTypes: {},
  args: {
    max: 100,
    value: 30,
  },
  component: Progress,
  tags: ["autodocs"],
  title: "ui/Progress",
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the progress.
 */
export const Default: Story = {};

/**
 * When the progress is indeterminate.
 */
export const Indeterminate: Story = {
  args: {
    value: undefined,
  },
};

/**
 * When the progress is completed.
 */
export const Completed: Story = {
  args: {
    value: 100,
  },
};
