import { Button } from '@repo/design-system/components/ui/button';
import type { Meta, StoryObj } from '@storybook/react';
import { ChevronRight } from 'lucide-react';

/**
 * Displays a button or a component that looks like a button.
 */
const meta = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'tertiary', 'link'],
    },
    size: {
      options: ['none', 'lg', 'md', 'sm'],
      control: 'select',
    },
    children: {
      control: 'text',
    },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'primary',
    // size: "lg",
    children: 'Button',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    size: 'lg',
  },
};

export const Secondary: Story = {
  render: (args) => (
    <Button {...args}>
      Button <ChevronRight className="size-6" />
    </Button>
  ),
  args: {
    variant: 'secondary',
    size: 'lg',
  },
};

export const Tertiary: Story = {
  render: (args) => (
    <Button {...args}>
      Button <ChevronRight className="size-6" />
    </Button>
  ),
  args: {
    variant: 'tertiary',
  },
};

export const Link: Story = {
  args: {
    variant: 'link',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const WithIcon: Story = {
  render: (args) => (
    <Button {...args}>
      Button <ChevronRight className="size-6" />
    </Button>
  ),
  args: {
    ...Primary.args,
  },
};

export const Disabled: Story = {
  render: (args) => (
    <Button {...args}>
      Button <ChevronRight className="size-6" />
    </Button>
  ),
  args: {
    variant: 'primary',
    size: 'lg',
    disabled: true,
  },
};
