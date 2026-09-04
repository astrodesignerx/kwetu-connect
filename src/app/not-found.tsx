import Link from "next/link";

export default function NotFound() {
  return (
    <section className="relative min-h-[70vh] flex items-center bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-32 text-center">
        <span className="section-label inline-block text-xs font-semibold text-brand-600 uppercase tracking-[0.15em] mb-5">
          404
        </span>
        <h1 className="text-[2rem] sm:text-5xl font-extrabold leading-tight tracking-[-0.02em] mb-6">
          This page is{" "}
          <span className="italic text-brand-500">off screen.</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-300 leading-relaxed mb-10 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
          Let&apos;s get your brand back on the map instead.
        </p>
        <Link
          href="/"
          className="group btn-sweep inline-flex items-center justify-center px-6 py-3 rounded-full bg-brand-500 text-black font-semibold text-sm tracking-wide transition-all duration-200 no-underline"
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
