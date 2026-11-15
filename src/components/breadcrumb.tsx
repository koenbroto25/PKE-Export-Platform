import React from "react";

export function Breadcrumb({ items = [] }: { items?: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="breadcrumb" className="mb-4">
      <ol className="flex items-center gap-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <svg
                className="h-3.5 w-3.5 fill-current"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 16l4-4L16 12l-6-6" />
              </svg>
            )}
            {item.href ? (
              <a href={item.href} className="hover:text-primary transition-colors">
                {item.label}
              </a>
            ) : (
              <span className="font-medium">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}