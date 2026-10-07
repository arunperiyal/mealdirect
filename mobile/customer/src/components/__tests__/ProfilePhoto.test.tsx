import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProfilePhoto, type User } from '@mealdirect/shared';

const mockLaunch = jest.fn();
const mockResize = jest.fn();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (o: unknown) => mockLaunch(o) }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => {
      const context = {
        resize: (size: unknown) => {
          mockResize(size);
          return context;
        },
        renderAsync: async () => ({ saveAsync: async () => ({ base64: 'BASE64JPEG' }) }),
      };
      return context;
    },
  },
}));

const user: User = { id: 'u1', email: 'p@test', firstName: 'Priya', lastName: 'R', phone: null, role: 'customer', avatarUrl: null };

describe('ProfilePhoto', () => {
  beforeEach(() => {
    mockLaunch.mockReset();
    mockResize.mockReset();
  });

  test('picks a square photo, shrinks it and uploads it', async () => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://p.jpg', width: 2000, height: 1500 }] });
    const updated = { ...user, avatarUrl: '/api/avatars/u1?v=1' };
    const setAvatar = jest.fn().mockResolvedValue(updated);
    const onChange = jest.fn();
    await render(
      <ProfilePhoto user={user} baseUrl="http://api" setAvatar={setAvatar} removeAvatar={jest.fn()} onChange={onChange} />
    );

    expect(screen.getByText('PR')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add photo'));
    expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }));
    expect(mockResize).toHaveBeenCalledWith({ height: 512 });
    expect(setAvatar).toHaveBeenCalledWith('BASE64JPEG');
    expect(onChange).toHaveBeenCalledWith(updated);
  });

  test('does nothing when the user cancels; removes a photo', async () => {
    mockLaunch.mockResolvedValue({ canceled: true, assets: null });
    const withPhoto = { ...user, avatarUrl: '/api/avatars/u1?v=1' };
    const setAvatar = jest.fn();
    const removeAvatar = jest.fn().mockResolvedValue(user);
    const onChange = jest.fn();
    await render(
      <ProfilePhoto user={withPhoto} baseUrl="http://api" setAvatar={setAvatar} removeAvatar={removeAvatar} onChange={onChange} />
    );

    await fireEvent.press(screen.getByText('Change photo'));
    expect(setAvatar).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith(user);
  });
});
