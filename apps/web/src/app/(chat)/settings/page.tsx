'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { fetchApi } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { Camera, Loader2, ShieldAlert, UploadCloud } from 'lucide-react';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    avatarUrl: '',
    phoneNumber: '',
    department: '',
    jobTitle: '',
    timezone: 'UTC',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const forcePasswordReset = searchParams.get('force') === 'password-reset' || !!user?.mustChangePassword;

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      avatarUrl: user?.avatarUrl || '',
      phoneNumber: user?.phoneNumber || '',
      department: user?.department || '',
      jobTitle: user?.jobTitle || '',
      timezone: user?.timezone || 'UTC',
    });
  }, [user]);

  useEffect(() => {
    if (forcePasswordReset) {
      setActiveTab('privacy');
    }
  }, [forcePasswordReset]);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage('');
    try {
      const response = await fetchApi<{ success: boolean; data: any }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });
      if (response.success && response.data) {
        updateUser(response.data);
        setProfileMessage('Profile updated successfully.');
      }
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileMessage('Please choose an image file for your profile photo.');
      return;
    }

    setAvatarUploading(true);
    setProfileMessage('');
    try {
      const presignRes = await fetchApi<{ success: boolean; data: { uploadUrl: string; fileId: string } }>('/api/files/avatar/presign', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });

      const uploadRes = await fetch(presignRes.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Profile photo upload failed.');
      }

      const confirmRes = await fetchApi<{ success: boolean; data: any }>('/api/files/avatar/confirm', {
        method: 'POST',
        body: JSON.stringify({ fileId: presignRes.data.fileId }),
      });

      updateUser(confirmRes.data);
      setProfileForm((current) => ({ ...current, avatarUrl: confirmRes.data.avatarUrl || '' }));
      setProfileMessage('Profile photo updated.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Failed to upload profile photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    setProfileSaving(true);
    setProfileMessage('');
    try {
      const response = await fetchApi<{ success: boolean; data: any }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: '' }),
      });
      if (response.success && response.data) {
        updateUser(response.data);
        setProfileForm((current) => ({ ...current, avatarUrl: '' }));
        setProfileMessage('Profile photo removed.');
      }
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Failed to remove profile photo.');
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('New passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage('');
    try {
      const response = await fetchApi<{ success: boolean; message?: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setPasswordMessage(response.message || 'Password updated successfully.');
      updateUser({ mustChangePassword: false });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Failed to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <div className="flex flex-1 gap-6 p-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex w-full gap-6"
        >
          <TabsList className="flex h-fit w-48 flex-col items-start gap-1 bg-transparent p-0">
            <TabsTrigger value="profile" className="w-full justify-start">Profile</TabsTrigger>
            <TabsTrigger value="notifications" className="w-full justify-start">Notifications</TabsTrigger>
            <TabsTrigger value="appearance" className="w-full justify-start">Appearance</TabsTrigger>
            <TabsTrigger value="privacy" className="w-full justify-start">Privacy &amp; Security</TabsTrigger>
            <TabsTrigger value="audio-video" className="w-full justify-start">Audio &amp; Video</TabsTrigger>
            <TabsTrigger value="integrations" className="w-full justify-start">Integrations</TabsTrigger>
            <TabsTrigger value="billing" className="w-full justify-start">Billing</TabsTrigger>
          </TabsList>

          <div className="flex-1">
            {/* Profile */}
            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>Update your personal information, presence, and profile photo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {profileMessage && (
                    <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      {profileMessage}
                    </p>
                  )}
                  <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#06b6d4,#0f766e)] text-xl font-semibold text-white shadow-[0_14px_30px_rgba(8,145,178,0.2)]">
                        {profileForm.avatarUrl ? (
                          <img src={profileForm.avatarUrl} alt={profileForm.name || user?.name || 'Avatar'} className="h-full w-full object-cover" />
                        ) : (
                          (profileForm.name || user?.name || 'U')
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="text-base font-semibold">{profileForm.name || user?.name}</p>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          JPG, PNG, or WebP up to 10 MB.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          void handleAvatarUpload(file);
                          event.currentTarget.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                      >
                        {avatarUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        {avatarUploading ? 'Uploading…' : 'Upload Photo'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={removeAvatar}
                        disabled={profileSaving || !profileForm.avatarUrl}
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Display Name</label>
                    <Input
                      placeholder="Your name"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((current) => ({ ...current, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input type="email" value={user?.email || ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Department</label>
                    <Input
                      placeholder="Product, Engineering, Sales..."
                      value={profileForm.department}
                      onChange={(e) => setProfileForm((current) => ({ ...current, department: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={profileForm.phoneNumber}
                      onChange={(e) => setProfileForm((current) => ({ ...current, phoneNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Job Title</label>
                    <Input
                      placeholder="Designer, Engineer, Founder..."
                      value={profileForm.jobTitle}
                      onChange={(e) => setProfileForm((current) => ({ ...current, jobTitle: e.target.value }))}
                    />
                  </div>
                  <Button onClick={saveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notifications */}
            <TabsContent value="notifications">
              <Card>
                <CardHeader>
                  <CardTitle>Notifications</CardTitle>
                  <CardDescription>Configure how you receive notifications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Desktop Notifications</h3>
                    <div className="space-y-3">
                      {['Direct Messages', 'Mentions', 'Channel Messages', 'Reactions'].map((item) => (
                        <div key={item} className="flex items-center justify-between">
                          <span className="text-sm">{item}</span>
                          <input type="checkbox" defaultChecked className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Email Notifications</h3>
                    <div className="space-y-3">
                      {['Daily Digest', 'Weekly Summary', 'Missed Mentions'].map((item) => (
                        <div key={item} className="flex items-center justify-between">
                          <span className="text-sm">{item}</span>
                          <input type="checkbox" className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Do Not Disturb</h3>
                    <div className="flex gap-3">
                      <Input type="time" defaultValue="22:00" className="w-32" />
                      <span className="self-center text-sm text-muted-foreground">to</span>
                      <Input type="time" defaultValue="08:00" className="w-32" />
                    </div>
                  </div>
                  <Button>Save Preferences</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Appearance */}
            <TabsContent value="appearance">
              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Customize the look and feel of the app.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Theme</h3>
                    <div className="flex gap-3">
                      {[
                        { label: 'Light', value: 'light' },
                        { label: 'Dark', value: 'dark' },
                        { label: 'System', value: 'system' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setTheme(option.value)}
                          className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                            theme === option.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-input hover:bg-accent'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Font Size</h3>
                    <select className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option>Small</option>
                      <option selected>Medium</option>
                      <option>Large</option>
                    </select>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Message Density</h3>
                    <div className="flex gap-3">
                      {['Compact', 'Comfortable', 'Spacious'].map((d) => (
                        <button
                          key={d}
                          className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button>Save Preferences</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy & Security */}
            <TabsContent value="privacy">
              <Card>
                <CardHeader>
                  <CardTitle>Privacy &amp; Security</CardTitle>
                  <CardDescription>Manage your privacy settings and account security.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {forcePasswordReset && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-300" />
                        <div>
                          <p className="font-medium text-amber-200">Password update required</p>
                          <p className="mt-1 text-amber-100/90">
                            This account was created with a temporary password. You can continue using the app, but we strongly recommend updating it here before sharing the workspace broadly.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="mb-3 text-sm font-medium">{forcePasswordReset ? 'Set your permanent password' : 'Change Password'}</h3>
                    <div className="space-y-3">
                      {passwordMessage && (
                        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                          {passwordMessage}
                        </p>
                      )}
                      <Input
                        type="password"
                        placeholder="Current password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))}
                      />
                      <Input
                        type="password"
                        placeholder="New password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((current) => ({ ...current, newPassword: e.target.value }))}
                      />
                      <Input
                        type="password"
                        placeholder="Confirm new password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))}
                      />
                      <Button variant="outline" onClick={changePassword} disabled={passwordSaving}>
                        {passwordSaving ? 'Updating…' : forcePasswordReset ? 'Save New Password' : 'Update Password'}
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Two-Factor Authentication</h3>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Add an extra layer of security to your account.
                    </p>
                    <Button variant="outline">Enable 2FA</Button>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Privacy</h3>
                    <div className="space-y-3">
                      {[
                        'Show online status',
                        'Allow direct messages from anyone',
                        'Show read receipts',
                      ].map((item) => (
                        <div key={item} className="flex items-center justify-between">
                          <span className="text-sm">{item}</span>
                          <input type="checkbox" defaultChecked className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-destructive">Danger Zone</h3>
                    <Button variant="destructive">Delete Account</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Audio & Video */}
            <TabsContent value="audio-video">
              <Card>
                <CardHeader>
                  <CardTitle>Audio &amp; Video</CardTitle>
                  <CardDescription>Configure your microphone, camera and speaker settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Microphone</h3>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option>Default Microphone</option>
                    </select>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Speaker</h3>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option>Default Speaker</option>
                    </select>
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Camera</h3>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option>Default Camera</option>
                    </select>
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    {[
                      'Noise suppression',
                      'Echo cancellation',
                      'Auto-adjust microphone volume',
                      'Hardware acceleration',
                    ].map((item) => (
                      <div key={item} className="flex items-center justify-between">
                        <span className="text-sm">{item}</span>
                        <input type="checkbox" defaultChecked className="h-4 w-4" />
                      </div>
                    ))}
                  </div>
                  <Button>Save Settings</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Integrations */}
            <TabsContent value="integrations">
              <Card>
                <CardHeader>
                  <CardTitle>Integrations</CardTitle>
                  <CardDescription>Connect third-party apps and services.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { name: 'Google Calendar', description: 'Sync meetings and events', connected: true },
                    { name: 'GitHub', description: 'Get notifications for PRs and issues', connected: false },
                    { name: 'Jira', description: 'Link tasks and track work', connected: false },
                    { name: 'Slack', description: 'Import messages from Slack', connected: false },
                    { name: 'Zoom', description: 'Start Zoom calls from chat', connected: false },
                  ].map((integration) => (
                    <div key={integration.name} className="flex items-center justify-between rounded-md border p-4">
                      <div>
                        <p className="text-sm font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">{integration.description}</p>
                      </div>
                      <Button
                        variant={integration.connected ? 'destructive' : 'outline'}
                        size="sm"
                      >
                        {integration.connected ? 'Disconnect' : 'Connect'}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing */}
            <TabsContent value="billing">
              <Card>
                <CardHeader>
                  <CardTitle>Billing</CardTitle>
                  <CardDescription>Manage your subscription and payment methods.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Current Plan</p>
                        <p className="text-2xl font-bold">Pro</p>
                        <p className="text-sm text-muted-foreground">$12 / user / month</p>
                      </div>
                      <Button variant="outline">Upgrade Plan</Button>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Payment Method</h3>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <span className="text-sm">Visa ending in 4242</span>
                      <Button variant="ghost" size="sm">Update</Button>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Billing History</h3>
                    <div className="space-y-2">
                      {['Mar 2026', 'Feb 2026', 'Jan 2026'].map((month) => (
                        <div key={month} className="flex items-center justify-between text-sm">
                          <span>{month}</span>
                          <span className="text-muted-foreground">$60.00</span>
                          <Button variant="ghost" size="sm">Download</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
