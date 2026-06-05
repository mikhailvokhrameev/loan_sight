export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg-color)",
        header: "var(--header-bg)",
        card: "var(--card-bg)",
        border: "var(--border-color)",
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
        },
        main: "var(--text-main)",
        muted: "var(--text-muted)",
        error: {
          DEFAULT: "var(--error)",
          bg: "var(--error-bg)",
        },
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          bg: "var(--warning-bg)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};