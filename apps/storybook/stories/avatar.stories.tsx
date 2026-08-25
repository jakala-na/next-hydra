import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

/**
 * An image element with a fallback for representing the user.
 */
const meta = {
  argTypes: {},
  component: Avatar,
  parameters: {
    layout: "centered",
  },
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src="https://github.com/shadcn.png" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
  tags: ["autodocs"],
  title: "ui/Avatar",
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the avatar.
 */
export const Default: Story = {};
