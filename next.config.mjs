/** @type {import('next').NextConfig} */

// Security headers (audit M-2). Applied to every route.
function securityHeaders() {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    // Data URLs are used for client-side image previews (scan flow); 'unsafe-inline'
    // styles are required by Tremor. Tighten later if you can remove them.
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
  ];
}

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(),
      },
    ];
  },
  images: {
    remotePatterns: [
      // Allow Supabase Storage / CDN-hosted images
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

export default nextConfig;
