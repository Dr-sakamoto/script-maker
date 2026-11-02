import type { Config } from 'tailwindcss';

/** 色は app/globals.css の CSS 変数（明るい／暗いで切り替わる）。舞台（/stage）と同じ紙の色に揃える */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix: string, keys: (number | string)[]) => Object.fromEntries(keys.map((k) => [k, v(`${prefix}-${k}`)]));
const neutral = scale('s', [50, 100, 200, 300, 400, 500, 600, 700, 750, 800, 850, 900, 950]);
const accent = scale('a', [200, 300, 400, 500, 600, 700, 950]);

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: neutral,
        violet: accent,
        indigo: accent,
        cueSound: '#3b82f6',
        cueLight: '#facc15',
      },
    },
  },
  plugins: [],
};

export default config;
