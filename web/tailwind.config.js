/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-prompt)', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // IBM Carbon g10 — แทนชุด Tailwind ที่จอใช้ตรง ๆ (blue/indigo/sky/gray/zinc)
        blue: { 50:'rgb(var(--c-blue-50) / <alpha-value>)',100:'rgb(var(--c-blue-100) / <alpha-value>)',200:'rgb(var(--c-blue-200) / <alpha-value>)',300:'rgb(var(--c-blue-300) / <alpha-value>)',400:'rgb(var(--c-blue-400) / <alpha-value>)',500:'rgb(var(--c-blue-500) / <alpha-value>)',600:'rgb(var(--c-blue-600) / <alpha-value>)',700:'rgb(var(--c-blue-700) / <alpha-value>)',800:'rgb(var(--c-blue-800) / <alpha-value>)',900:'rgb(var(--c-blue-900) / <alpha-value>)' },
        indigo: { 50:'rgb(var(--c-blue-50) / <alpha-value>)',100:'rgb(var(--c-blue-100) / <alpha-value>)',200:'rgb(var(--c-blue-200) / <alpha-value>)',300:'rgb(var(--c-blue-300) / <alpha-value>)',400:'rgb(var(--c-blue-400) / <alpha-value>)',500:'rgb(var(--c-blue-500) / <alpha-value>)',600:'rgb(var(--c-blue-600) / <alpha-value>)',700:'rgb(var(--c-blue-700) / <alpha-value>)',800:'rgb(var(--c-blue-800) / <alpha-value>)',900:'rgb(var(--c-blue-900) / <alpha-value>)' },
        sky: { 50:'rgb(var(--c-blue-50) / <alpha-value>)',100:'rgb(var(--c-blue-100) / <alpha-value>)',200:'rgb(var(--c-blue-200) / <alpha-value>)',300:'rgb(var(--c-blue-300) / <alpha-value>)',400:'rgb(var(--c-blue-400) / <alpha-value>)',500:'rgb(var(--c-blue-500) / <alpha-value>)',600:'rgb(var(--c-blue-600) / <alpha-value>)',700:'rgb(var(--c-blue-700) / <alpha-value>)',800:'rgb(var(--c-blue-800) / <alpha-value>)',900:'rgb(var(--c-blue-900) / <alpha-value>)' },
        gray: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' },
        zinc: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' },
        // Carbon g10 สถานะ: เขียว=สำเร็จ แดง=ผิดพลาด ส้ม=เตือน · สีตกแต่งอื่นเป็นเทา (MaintainX: ใช้คู่พื้น+ตัวหนังสือของ tag)
        green: { 50:'rgb(var(--c-green-50) / <alpha-value>)',100:'rgb(var(--c-green-100) / <alpha-value>)',200:'rgb(var(--c-green-200) / <alpha-value>)',300:'rgb(var(--c-green-300) / <alpha-value>)',400:'rgb(var(--c-green-400) / <alpha-value>)',500:'rgb(var(--c-green-500) / <alpha-value>)',600:'rgb(var(--c-green-600) / <alpha-value>)',700:'rgb(var(--c-green-700) / <alpha-value>)',800:'rgb(var(--c-green-800) / <alpha-value>)',900:'rgb(var(--c-green-900) / <alpha-value>)' }, emerald: { 50:'rgb(var(--c-green-50) / <alpha-value>)',100:'rgb(var(--c-green-100) / <alpha-value>)',200:'rgb(var(--c-green-200) / <alpha-value>)',300:'rgb(var(--c-green-300) / <alpha-value>)',400:'rgb(var(--c-green-400) / <alpha-value>)',500:'rgb(var(--c-green-500) / <alpha-value>)',600:'rgb(var(--c-green-600) / <alpha-value>)',700:'rgb(var(--c-green-700) / <alpha-value>)',800:'rgb(var(--c-green-800) / <alpha-value>)',900:'rgb(var(--c-green-900) / <alpha-value>)' },
        red: { 50:'rgb(var(--c-red-50) / <alpha-value>)',100:'rgb(var(--c-red-100) / <alpha-value>)',200:'rgb(var(--c-red-200) / <alpha-value>)',300:'rgb(var(--c-red-300) / <alpha-value>)',400:'rgb(var(--c-red-400) / <alpha-value>)',500:'rgb(var(--c-red-500) / <alpha-value>)',600:'rgb(var(--c-red-600) / <alpha-value>)',700:'rgb(var(--c-red-700) / <alpha-value>)',800:'rgb(var(--c-red-800) / <alpha-value>)',900:'rgb(var(--c-red-900) / <alpha-value>)' }, rose: { 50:'rgb(var(--c-red-50) / <alpha-value>)',100:'rgb(var(--c-red-100) / <alpha-value>)',200:'rgb(var(--c-red-200) / <alpha-value>)',300:'rgb(var(--c-red-300) / <alpha-value>)',400:'rgb(var(--c-red-400) / <alpha-value>)',500:'rgb(var(--c-red-500) / <alpha-value>)',600:'rgb(var(--c-red-600) / <alpha-value>)',700:'rgb(var(--c-red-700) / <alpha-value>)',800:'rgb(var(--c-red-800) / <alpha-value>)',900:'rgb(var(--c-red-900) / <alpha-value>)' },
        amber: { 50:'rgb(var(--c-amber-50) / <alpha-value>)',100:'rgb(var(--c-amber-100) / <alpha-value>)',200:'rgb(var(--c-amber-200) / <alpha-value>)',300:'rgb(var(--c-amber-300) / <alpha-value>)',400:'rgb(var(--c-amber-400) / <alpha-value>)',500:'rgb(var(--c-amber-500) / <alpha-value>)',600:'rgb(var(--c-amber-600) / <alpha-value>)',700:'rgb(var(--c-amber-700) / <alpha-value>)',800:'rgb(var(--c-amber-800) / <alpha-value>)',900:'rgb(var(--c-amber-900) / <alpha-value>)' }, orange: { 50:'rgb(var(--c-amber-50) / <alpha-value>)',100:'rgb(var(--c-amber-100) / <alpha-value>)',200:'rgb(var(--c-amber-200) / <alpha-value>)',300:'rgb(var(--c-amber-300) / <alpha-value>)',400:'rgb(var(--c-amber-400) / <alpha-value>)',500:'rgb(var(--c-amber-500) / <alpha-value>)',600:'rgb(var(--c-amber-600) / <alpha-value>)',700:'rgb(var(--c-amber-700) / <alpha-value>)',800:'rgb(var(--c-amber-800) / <alpha-value>)',900:'rgb(var(--c-amber-900) / <alpha-value>)' }, yellow: { 50:'rgb(var(--c-amber-50) / <alpha-value>)',100:'rgb(var(--c-amber-100) / <alpha-value>)',200:'rgb(var(--c-amber-200) / <alpha-value>)',300:'rgb(var(--c-amber-300) / <alpha-value>)',400:'rgb(var(--c-amber-400) / <alpha-value>)',500:'rgb(var(--c-amber-500) / <alpha-value>)',600:'rgb(var(--c-amber-600) / <alpha-value>)',700:'rgb(var(--c-amber-700) / <alpha-value>)',800:'rgb(var(--c-amber-800) / <alpha-value>)',900:'rgb(var(--c-amber-900) / <alpha-value>)' },
        violet: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' }, purple: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' }, teal: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' }, cyan: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' }, pink: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' }, lime: { 50:'rgb(var(--c-gray-50) / <alpha-value>)',100:'rgb(var(--c-gray-100) / <alpha-value>)',200:'rgb(var(--c-gray-200) / <alpha-value>)',300:'rgb(var(--c-gray-300) / <alpha-value>)',400:'rgb(var(--c-gray-400) / <alpha-value>)',500:'rgb(var(--c-gray-500) / <alpha-value>)',600:'rgb(var(--c-gray-600) / <alpha-value>)',700:'rgb(var(--c-gray-700) / <alpha-value>)',800:'rgb(var(--c-gray-800) / <alpha-value>)',900:'rgb(var(--c-gray-900) / <alpha-value>)' },
        layer: 'rgb(var(--c-layer) / <alpha-value>)',
        // Custom minimal colors
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          elevated: 'hsl(var(--surface-elevated))',
        },
        hover: 'hsl(var(--hover))',
        divider: 'hsl(var(--divider))',
      },
      borderRadius: {
        // Carbon ไม่มีมุมมน — คงไว้แค่ full (ป้ายสถานะ วงรูปผู้ใช้)
        DEFAULT: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px', '3xl': '0px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-4px)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-in',
        'slide-in': 'slide-in 0.3s ease-out',
      },
      boxShadow: {
        'soft': 'none',
        'soft-lg': 'none',
        sm: 'none', DEFAULT: 'none', md: 'none',
        // เมนูลอย/ลิ้นชักเท่านั้นที่มีเงา (Carbon menu shadow)
        lg: '0 2px 6px rgba(0,0,0,0.3)', xl: '0 2px 6px rgba(0,0,0,0.3)', '2xl': '0 2px 6px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
