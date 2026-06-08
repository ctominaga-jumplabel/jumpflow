import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    defaultVariants: {
      size: "md",
      variant: "primary",
    },
    variants: {
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5",
        icon: "size-10",
      },
      variant: {
        primary:
          "bg-[#2563eb] text-white hover:bg-[#1d4ed8] focus-visible:outline-[#2563eb]",
        secondary:
          "border border-[#d9ded4] bg-white text-[#1d2520] hover:bg-[#f6f7f2] focus-visible:outline-[#2563eb]",
        ghost:
          "text-[#4b6358] hover:bg-[#eef3f7] hover:text-[#111814] focus-visible:outline-[#2563eb]",
        danger:
          "bg-[#dc2626] text-white hover:bg-[#b91c1c] focus-visible:outline-[#dc2626]",
      },
    },
  },
);

