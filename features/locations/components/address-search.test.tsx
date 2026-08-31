// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddressSearch } from "./address-search";

const suggestion = {
  id: "101",
  label: "10 Herzl Street, Haifa, Israel",
  city: "Haifa",
  latitude: 32.815,
  longitude: 34.989,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddressSearch", () => {
  it("opens suggestions while typing and confirms a keyboard selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ suggestions: [suggestion] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(<AddressSearch city="Haifa" locationKind="venue" onConfirm={onConfirm} />);

    const input = screen.getByRole("combobox", { name: "Public address" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.type(input, "10 Herzl Street");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/locations/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      query: "10 Herzl Street",
      city: "Haifa",
      locationKind: "venue",
    });

    expect(await screen.findByRole("option", { name: suggestion.label })).toBeVisible();
    expect(input).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onConfirm).toHaveBeenCalledWith(suggestion);
    expect(input).toHaveValue(suggestion.label);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a controlled unavailable state without echoing the submitted address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE" } }), {
          status: 503,
        }),
      ),
    );
    const user = userEvent.setup();
    const submitted = "PUBLIC-ADDRESS-NOT-FOR-ERROR-COPY";

    render(<AddressSearch city="Haifa" locationKind="public_place" onConfirm={vi.fn()} />);
    await user.type(screen.getByRole("combobox", { name: "Public address" }), submitted);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Address search is temporarily unavailable");
    expect(alert).not.toHaveTextContent(submitted);
  });

  it("does not search until three trimmed characters are present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AddressSearch city="Haifa" locationKind="venue" onConfirm={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Public address" });
    await user.type(input, "  a ");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(input, "bc");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it("invalidates local and parent confirmation when the address text changes or a new search starts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [suggestion] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ suggestions: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<AddressSearch city="Haifa" locationKind="venue" onConfirm={onConfirm} />);

    const input = screen.getByRole("combobox", { name: "Public address" });
    await user.type(input, "10 Herzl Street");
    await user.click(await screen.findByRole("option", { name: suggestion.label }));
    expect(onConfirm).toHaveBeenLastCalledWith(suggestion);

    await user.type(input, " edited");
    expect(onConfirm).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText("Pin ready to confirm in Haifa.")).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "10 Herzl Street");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(onConfirm).toHaveBeenLastCalledWith(null);
  });

  it("ignores a delayed response after the query has moved to a newer search", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    let resolveSecond: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const newerSuggestion = {
      ...suggestion,
      id: "202",
      label: "20 Hanassi Boulevard, Haifa, Israel",
    };
    const user = userEvent.setup();
    render(<AddressSearch city="Haifa" locationKind="venue" onConfirm={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "Public address" });
    await user.type(input, "10 Herzl Street");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.clear(input);
    await user.type(input, "20 Hanassi Boulevard");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    resolveSecond?.(
      new Response(JSON.stringify({ suggestions: [newerSuggestion] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await screen.findByRole("option", { name: newerSuggestion.label })).toBeVisible();

    resolveFirst?.(
      new Response(JSON.stringify({ suggestions: [suggestion] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: suggestion.label })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: newerSuggestion.label })).toBeVisible();
  });

  it("always displays linked OpenStreetMap attribution", () => {
    render(<AddressSearch city="Haifa" locationKind="venue" onConfirm={vi.fn()} />);

    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
  });
});
