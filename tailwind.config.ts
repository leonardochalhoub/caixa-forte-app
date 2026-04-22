import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#FFFFFF",
        subtle: "#F5F5F5",
        border: "#E5E5E5",
        muted: "#A3A3A3",
        body: "#525252",
        strong: "#171717",
        ink: "#000000",
        income: "#16A34A",
        expense: "#DC2626",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
}

export default config
