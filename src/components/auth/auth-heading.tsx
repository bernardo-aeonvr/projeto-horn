import { HornLogo } from "@/components/brand/horn-logo";

type AuthHeadingProps = {
  title: string;
  description: string;
};

export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="mb-8">
      {/* No desktop a marca já aparece no painel lateral. */}
      <HornLogo className="mb-7 h-16 lg:hidden" />

      <h1 className="text-2xl font-semibold tracking-tight text-graphite-900">
        {title}
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-graphite-500">
        {description}
      </p>
    </div>
  );
}
