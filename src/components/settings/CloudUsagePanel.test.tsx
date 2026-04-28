import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LicensePayload, UsageResponse } from '@/services/luminaCloud';
import { useLicenseStore } from '@/stores/useLicenseStore';

import { CloudUsagePanel } from './CloudUsagePanel';

const getUsage = vi.hoisted(() => vi.fn());

vi.mock('@/services/luminaCloud', async () => {
  const actual = await vi.importActual<typeof import('@/services/luminaCloud')>(
    '@/services/luminaCloud'
  );
  return {
    ...actual,
    getUsage,
  };
});

const VALID_PAYLOAD: LicensePayload = {
  v: 1,
  lid: 'lic_01HXTEST',
  email: 'fixture@example.com',
  sku: 'lumina-lifetime-founders',
  features: ['cloud_ai'],
  issued_at: '2026-04-28T12:00:00Z',
  expires_at: null,
  order_id: 'creem_ord_test',
  device_limit: 5,
};

const USAGE: UsageResponse = {
  period_start: '2026-04-01T00:00:00Z',
  period_end: '2026-04-30T23:59:59Z',
  tokens_used: 12345,
  tokens_quota: 5_000_000,
  requests_count: 17,
};

beforeEach(() => {
  useLicenseStore.setState({ license: null, payload: null, status: 'idle' });
  getUsage.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CloudUsagePanel — license absent', () => {
  it('renders nothing when no license is present', () => {
    const { container } = render(<CloudUsagePanel />);
    expect(container.firstChild).toBeNull();
    expect(getUsage).not.toHaveBeenCalled();
  });

  it('renders nothing when status is invalid', () => {
    useLicenseStore.setState({ license: 'bad', payload: null, status: 'invalid' });
    const { container } = render(<CloudUsagePanel />);
    expect(container.firstChild).toBeNull();
    expect(getUsage).not.toHaveBeenCalled();
  });
});

describe('CloudUsagePanel — license valid', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      license: 'valid-token',
      payload: VALID_PAYLOAD,
      status: 'valid',
    });
  });

  it('shows a loading hint, then the formatted usage line on success', async () => {
    getUsage.mockResolvedValue(USAGE);

    render(<CloudUsagePanel />);

    expect(screen.getByText(/Loading usage/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/12,345/)).toBeInTheDocument();
    });
    expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-30/)).toBeInTheDocument();
    expect(screen.queryByText(/Retrying/i)).not.toBeInTheDocument();
  });

  it('keeps showing the last successful value and a Retrying hint after a poll fails', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getUsage.mockResolvedValueOnce(USAGE).mockRejectedValueOnce(new Error('network'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<CloudUsagePanel />);

    // First fetch succeeds.
    await waitFor(() => expect(screen.getByText(/12,345/)).toBeInTheDocument());

    // Advance one poll interval — the second fetch rejects.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    await waitFor(() => expect(screen.getByText(/Retrying/i)).toBeInTheDocument());
    // The last successful value is still rendered.
    expect(screen.getByText(/12,345/)).toBeInTheDocument();
  });

  it('shows the no-cache retrying hint when the very first fetch fails', async () => {
    getUsage.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<CloudUsagePanel />);

    await waitFor(() => expect(screen.getByText(/Could not fetch usage/i)).toBeInTheDocument());
    expect(screen.queryByText(/Loading usage/i)).not.toBeInTheDocument();
  });

  it('refetches every 60s while mounted', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getUsage.mockResolvedValue(USAGE);

    render(<CloudUsagePanel />);

    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(2));

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(3));
  });

  it('clears the polling interval on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getUsage.mockResolvedValue(USAGE);

    const { unmount } = render(<CloudUsagePanel />);
    await waitFor(() => expect(getUsage).toHaveBeenCalledTimes(1));

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(60_000 * 5);
    });
    expect(getUsage).toHaveBeenCalledTimes(1);
  });
});
