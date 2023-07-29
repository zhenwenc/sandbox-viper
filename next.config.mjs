/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  /**
   * Deploy webapp under a sub-path for clear separation.
   */
  basePath: '/viper',
  /**
   * Path mappings.
   */
  rewrites: async () => ({
    fallback: [
      { source: '/', destination: `/viper` },
      { source: '/:path*', destination: `/api/:path*` },
    ],
  }),
  /**
   * Built-in ESLint support.
   *
   * https://nextjs.org/docs/basic-features/eslint
   */
  eslint: {
    ignoreDuringBuilds: true, // disable for this demo repo
  },
  /**
   * Enable/disable integration of SWC (Rust-based compiler)
   *
   * https://swc.rs
   * https://nextjs.org/docs/messages/failed-loading-swc
   */
  swcMinify: true,
};

export default nextConfig;
