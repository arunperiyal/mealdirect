import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SavedAddress } from '@mealdirect/shared';
import { AddressPicker } from '@/components/AddressPicker';

const saved: SavedAddress[] = [
  { id: 'a1', label: 'Home', address: '12 MG Road, Flat 4B', lastUsedAt: '2026-10-01T10:00:00Z', createdAt: '2026-09-01T10:00:00Z' },
  { id: 'a2', label: 'Work', address: '5 Tech Park, Tower C', lastUsedAt: null, createdAt: '2026-09-02T10:00:00Z' },
];

describe('AddressPicker', () => {
  test('starts with the most recently used address; switching picks another', async () => {
    const onChange = jest.fn();
    await render(<AddressPicker addresses={saved} onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith({ address: '12 MG Road, Flat 4B', saveAs: null });

    await fireEvent.press(screen.getByLabelText('Work, 5 Tech Park, Tower C'));
    expect(onChange).toHaveBeenLastCalledWith({ address: '5 Tech Park, Tower C', saveAs: null });
  });

  test('a new address is saved under the name given, unless switched off', async () => {
    const onChange = jest.fn();
    await render(<AddressPicker addresses={saved} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('A new address'));
    await fireEvent.changeText(screen.getByLabelText('Delivery address'), '9 Lake View');
    await fireEvent.changeText(screen.getByLabelText('Name it'), 'Parents');
    expect(onChange).toHaveBeenLastCalledWith({ address: '9 Lake View', saveAs: 'Parents' });

    await fireEvent(screen.getByLabelText('Save for next time'), 'valueChange', false);
    expect(onChange).toHaveBeenLastCalledWith({ address: '9 Lake View', saveAs: null });
  });

  test('with nothing saved, it asks for an address and offers to save it as Home', async () => {
    const onChange = jest.fn();
    await render(<AddressPicker addresses={[]} onChange={onChange} />);
    expect(screen.queryByText('Deliver to')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Delivery address'), '1 First Street');
    expect(onChange).toHaveBeenLastCalledWith({ address: '1 First Street', saveAs: 'Home' });
  });
});
