import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { FixtureFilters } from "@/features/sports/browse-schemas";
import { fixturePageHref } from "@/features/sports/query";

type FixturePaginationProps = Readonly<{
  filters: FixtureFilters;
  totalPages: number;
}>;

type PaginationEntry = number | "ellipsis";

function paginationEntries(current: number, totalPages: number): PaginationEntry[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (current <= 3) {
    return [1, 2, 3, "ellipsis", totalPages];
  }

  if (current >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", current, "ellipsis", totalPages];
}

export function FixturePagination({ filters, totalPages }: FixturePaginationProps) {
  if (totalPages <= 1) return null;

  const current = Math.min(filters.page, totalPages);
  const entries = paginationEntries(current, totalPages);

  return (
    <Pagination className="mt-10">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={current === 1}
            className={current === 1 ? "pointer-events-none opacity-50" : undefined}
            href={current === 1 ? undefined : fixturePageHref(filters, current - 1)}
          />
        </PaginationItem>
        {entries.map((entry, index) =>
          entry === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={entry}>
              <PaginationLink
                aria-label={
                  entry === current ? `Page ${entry}, current page` : `Go to page ${entry}`
                }
                href={fixturePageHref(filters, entry)}
                isActive={entry === current}
                className="min-h-11 min-w-11"
              >
                {entry}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            aria-disabled={current === totalPages}
            className={current === totalPages ? "pointer-events-none opacity-50" : undefined}
            href={current === totalPages ? undefined : fixturePageHref(filters, current + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
