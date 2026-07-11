/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/customers', destination: '/clients', permanent: true },
      { source: '/customers/:path*', destination: '/clients/:path*', permanent: true },
    ]
  },
};

export default nextConfig;
