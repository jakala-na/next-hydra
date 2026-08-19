import { Label } from "@repo/design-system/components/ui/label";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Renders an accessible label associated with controls.
 */
const meta = {
  argTypes: {
    children: {
      control: { type: "text" },
    },
  },
  args: {
    children: "Your email address",
    htmlFor: "email",
  },
  component: Label,
  tags: ["autodocs"],
  title: "ui/Label",
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof Label>;

/**
 * The default form of the label.
 */
export const Default: Story = {};
