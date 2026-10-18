import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fetchSignalById } from "@/lib/api";
import { I18nProvider } from "@/lib/i18n";

import SignalDetailPage from "./page";

// KJC-TSK-1095: in next 15 a page's params prop is a Promise. This page is a client
// component, so it reads the route's id with useParams, which works the same in 14.
const route = vi.hoisted(() => ({ id: "sig-42" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: route.id }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  fetchSignalById: vi.fn(() => new Promise(() => {})),
  updateSignalStatus: vi.fn(),
}));

const renderPage = () =>
  render(
    <I18nProvider>
      <SignalDetailPage />
    </I18nProvider>,
  );

describe("SignalDetailPage", () => {
  it("loads the signal named by the route, without a params prop", async () => {
    renderPage();
    await waitFor(() => expect(fetchSignalById).toHaveBeenCalledWith("sig-42"));
  });

  it("tells a missing signal (404) apart from a failed load", async () => {
    vi.mocked(fetchSignalById).mockRejectedValueOnce(Object.assign(new Error("gone"), { status: 404 }));
    const missing = renderPage();
    expect(await screen.findByText("Signal not found")).toBeInTheDocument();
    expect(screen.getByText(/sig-42/)).toBeInTheDocument();
    missing.unmount();

    vi.mocked(fetchSignalById).mockRejectedValueOnce(new Error("backend down"));
    renderPage();
    expect(await screen.findByText("Unable to load signal details")).toBeInTheDocument();
  });

  it("forgets a 404 when the route moves to another signal", async () => {
    vi.mocked(fetchSignalById).mockRejectedValueOnce(Object.assign(new Error("gone"), { status: 404 }));
    const page = renderPage();
    expect(await screen.findByText("Signal not found")).toBeInTheDocument();
    route.id = "sig-43";
    page.rerender(
      <I18nProvider>
        <SignalDetailPage />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchSignalById).toHaveBeenCalledWith("sig-43"));
    expect(screen.queryByText("Signal not found")).not.toBeInTheDocument();
    route.id = "sig-42";
  });
});
