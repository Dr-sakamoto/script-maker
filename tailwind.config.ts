import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cueSound: '#3b82f6',
        cueLight: '#facc15',
      },
    },
  },
  plugins: [],
};

export default config;
