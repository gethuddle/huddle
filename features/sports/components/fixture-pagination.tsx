import {
  Pagination,
  PaginationContent,
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

export function FixturePagination({ filters, totalPages }: FixturePaginationProps) {
  if (totalPages <= 1) return null;

  const current = Math.min(filters.page, totalPages);
  const pages = Array.from(new Set([1, current - 1, current, current + 1, totalPages])).filter(
    (page) => page >= 1 && page <= totalPages,
  );

  return (
    <Pagination className="mt-10">
      <PaginationContent>
        {current > 1 ? (
          <PaginationItem>
            <PaginationPrevious href={fixturePageHref(filters, current - 1)} />
          </PaginationItem>
        ) : null}
        {pages.map((page) => (
          <PaginationItem key={page}>
            <PaginationLink href={fixturePageHref(filters, page)} isActive={page === current}>
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}
        {current < totalPages ? (
          <PaginationItem>
            <PaginationNext href={fixturePageHref(filters, current + 1)} />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}
