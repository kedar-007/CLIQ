'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

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
                  <CardDescription>Update your personal information.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Display Name</label>
                    <Input placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username</label>
                    <Input placeholder="@username" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input type="email" placeholder="you@example.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bio</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      rows={3}
                      placeholder="Tell people a little about yourself"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input type="tel" placeholder="+1 (555) 000-0000" />
                  </div>
                  <Button>Save Changes</Button>
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
                      {['Light', 'Dark', 'System'].map((theme) => (
                        <button
                          key={theme}
                          className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
                        >
                          {theme}
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
                  <div>
                    <h3 className="mb-3 text-sm font-medium">Change Password</h3>
                    <div className="space-y-3">
                      <Input type="password" placeholder="Current password" />
                      <Input type="password" placeholder="New password" />
                      <Input type="password" placeholder="Confirm new password" />
                      <Button variant="outline">Update Password</Button>
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
