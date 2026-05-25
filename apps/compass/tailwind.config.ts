import type { Config } from 'tailwindcss';

/**
 * Compass (ライト版) の Tailwind 設定。Explorer と同じ構造を先行整備して、
 * Compass UI 実装着手時に CSS クラスが PurgeCSS で消える事故を防ぐ。
 * darkMode は 'class' で Explorer と統一 (将来的に hooks/useTheme を共有する想定)。
 */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
