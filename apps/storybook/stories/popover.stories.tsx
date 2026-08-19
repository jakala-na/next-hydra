import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * Displays rich content in a portal, triggered by a button.
 */
const meta = {
  argTypes: {},
  component: Popover,
  parameters: {
    layout: "centered",
  },
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Place content for the popover here.</PopoverContent>
    </Popover>
  ),
  tags: ["autodocs"],
  title: "ui/Popover",
} satisfies Meta<typeof Popover>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the popover.
 */
export const Default: Story = {};
