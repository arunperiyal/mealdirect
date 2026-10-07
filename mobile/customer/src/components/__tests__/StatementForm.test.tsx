import { fireEvent, render, screen } from '@testing-library/react-native';
import { StatementForm, statementPeriods } from '@mealdirect/shared';

describe('StatementForm', () => {
  test('downloads this month by default, another period, or chosen dates', async () => {
    const download = jest.fn().mockResolvedValue(undefined);
    await render(<StatementForm description="Your orders" download={download} />);
    const [thisMonth, lastMonth] = statementPeriods();

    await fireEvent.press(screen.getByText('Download statement'));
    expect(download).toHaveBeenLastCalledWith({ from: thisMonth.from, to: thisMonth.to });
    expect(await screen.findByText(/is ready/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Last month'));
    await fireEvent.press(screen.getByText('Download statement'));
    expect(download).toHaveBeenLastCalledWith({ from: lastMonth.from, to: lastMonth.to });

    await fireEvent.press(screen.getByText('Choose dates'));
    await fireEvent.changeText(screen.getByLabelText('From'), '2026-03-01');
    await fireEvent.changeText(screen.getByLabelText('To'), '2026-02-01');
    await fireEvent.press(screen.getByText('Download statement'));
    expect(screen.getByText('The end date is before the start date')).toBeTruthy();
    expect(download).toHaveBeenCalledTimes(2);
  });

  test("shows the server's reason when the download fails", async () => {
    const download = jest.fn().mockRejectedValue(new Error('Cannot reach the server'));
    await render(<StatementForm description="Your orders" download={download} />);
    await fireEvent.press(screen.getByText('Download statement'));
    expect(await screen.findByText('Cannot reach the server')).toBeTruthy();
  });
});
