import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LicensePayload } from '@/services/luminaCloud';
import { useLicenseStore } from '@/stores/useLicenseStore';

import { LicenseSettings } from './LicenseSettings';

const verifyLicense = vi.hoisted(() => vi.fn());
const saveLicense = vi.hoisted(() => vi.fn());
const removeLicense = vi.hoisted(() => vi.fn());
const loadLicense = vi.hoisted(() => vi.fn());

vi.mock('@/services/luminaCloud', async () => {
  const actual = await vi.importActual<typeof import('@/services/luminaCloud')>(
    '@/services/luminaCloud'
  );
  return {
    ...actual,
    verifyLicense,
    saveLicense,
    removeLicense,
    loadLicense,
  };
});

const VALID_PAYLOAD: LicensePayload = {
  v: 1,
  lid: 'lic_01HXTEST',
  email: 'fixture@example.com',
  sku: 'lumina-lifetime-founders',
  features: ['cloud_ai', 'lifetime'],
  issued_at: '2026-04-28T12:00:00Z',
  expires_at: null,
  order_id: 'creem_ord_test',
  device_limit: 5,
};

beforeEach(() => {
  useLicenseStore.setState({ license: null, payload: null, status: 'idle' });
  verifyLicense.mockReset();
  saveLicense.mockReset();
  removeLicense.mockReset();
  loadLicense.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LicenseSettings — idle state', () => {
  it('renders the entry form with disabled Verify button before user types', () => {
    render(<LicenseSettings />);
    expect(screen.getByRole('heading', { name: /Lumina Cloud license/i })).toBeInTheDocument();
    expect(screen.getByLabelText('License token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify/i })).toBeDisabled();
  });

  it('does not throw when rendered repeatedly with no license', () => {
    expect(() => {
      const { unmount } = render(<LicenseSettings />);
      unmount();
      render(<LicenseSettings />);
    }).not.toThrow();
  });
});

describe('LicenseSettings — invalid state', () => {
  it('shows an error message after a failed verify attempt', async () => {
    verifyLicense.mockReturnValue(null);
    render(<LicenseSettings />);

    const textarea = screen.getByLabelText('License token') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'garbage' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Could not verify/i)
    );
    expect(useLicenseStore.getState().status).toBe('invalid');
  });
});

describe('LicenseSettings — valid state', () => {
  beforeEach(() => {
    useLicenseStore.setState({
      license: 'valid-token',
      payload: VALID_PAYLOAD,
      status: 'valid',
    });
  });

  it('shows email, SKU, expiry, and feature badges', () => {
    render(<LicenseSettings />);
    expect(screen.getByText('fixture@example.com')).toBeInTheDocument();
    expect(screen.getByText('lumina-lifetime-founders')).toBeInTheDocument();
    expect(screen.getByText('Lifetime')).toBeInTheDocument();
    expect(screen.getByText('cloud_ai')).toBeInTheDocument();
    expect(screen.getByText('lifetime')).toBeInTheDocument();
  });

  it('formats a non-null expiry as YYYY-MM-DD', () => {
    useLicenseStore.setState({
      license: 'valid-token',
      payload: { ...VALID_PAYLOAD, expires_at: '2027-04-28T12:00:00Z' },
      status: 'valid',
    });
    render(<LicenseSettings />);
    expect(screen.getByText('2027-04-28')).toBeInTheDocument();
  });

  it('clears the license through the confirmation flow', async () => {
    removeLicense.mockResolvedValue(undefined);
    render(<LicenseSettings />);

    fireEvent.click(screen.getByRole('button', { name: /Remove license/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));

    await waitFor(() => expect(useLicenseStore.getState().status).toBe('idle'));
    expect(removeLicense).toHaveBeenCalledTimes(1);
  });

  it('Cancel keeps the license and dismisses the confirmation', () => {
    render(<LicenseSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Remove license/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(useLicenseStore.getState().status).toBe('valid');
    expect(removeLicense).not.toHaveBeenCalled();
  });
});
