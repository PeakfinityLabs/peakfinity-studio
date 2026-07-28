"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchJson } from "@/lib/http";
import { JOB_TITLES, NO_JOB_TITLE } from "@/lib/job-titles";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EDITOR";
  jobTitle: string | null;
  status: "PENDING" | "APPROVED" | "DENIED";
  createdAt: string;
  reviewedByEmail: string | null;
  isSelf: boolean;
  lockedAdmin: boolean;
};

function statusVariant(status: AdminUserRow["status"]) {
  if (status === "APPROVED") return "default" as const;
  if (status === "DENIED") return "destructive" as const;
  return "secondary" as const;
}

export function AdminUsers({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, kind: "status" | "role", value: string) => {
    setBusyId(id);
    try {
      await fetchJson(`/api/admin/users/${id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "status" ? { status: value } : { role: value }),
      });
      toast.success("Updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const setTitle = async (id: string, value: string) => {
    setBusyId(id);
    try {
      await fetchJson(`/api/admin/users/${id}/title`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobTitle: value === NO_JOB_TITLE ? null : value }),
      });
      toast.success("Job title updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set job title");
    } finally {
      setBusyId(null);
    }
  };

  const pending = users.filter((u) => u.status === "PENDING");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-display text-lg">
            Pending approvals
            {pending.length > 0 && (
              <span className="ml-2 font-mono text-sm text-muted-foreground">
                {pending.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is waiting for approval. 🎉</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {pending.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "status", "APPROVED")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u.id}
                      onClick={() => void act(u.id, "status", "DENIED")}
                    >
                      Deny
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-display text-lg">All users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Job title</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{u.name}</span>
                        {u.isSelf && (
                          <span className="font-mono text-[10px] text-muted-foreground">you</span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.jobTitle ?? NO_JOB_TITLE}
                        onValueChange={(v) => void setTitle(u.id, v ?? NO_JOB_TITLE)}
                        disabled={busyId === u.id}
                      >
                        <SelectTrigger size="sm" className="w-40">
                          <SelectValue>
                            {u.jobTitle ?? (
                              <span className="text-muted-foreground">No title</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_JOB_TITLE}>No title</SelectItem>
                          {JOB_TITLES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                        {u.role.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(u.status)}>{u.status.toLowerCase()}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.isSelf ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {u.status !== "APPROVED" && (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyId === u.id}
                              onClick={() => void act(u.id, "status", "APPROVED")}
                            >
                              Approve
                            </Button>
                          )}
                          {u.status === "APPROVED" && (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyId === u.id || u.lockedAdmin}
                              onClick={() => void act(u.id, "status", "DENIED")}
                            >
                              Revoke
                            </Button>
                          )}
                          {u.role === "EDITOR" ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyId === u.id}
                              onClick={() => void act(u.id, "role", "ADMIN")}
                            >
                              Make admin
                            </Button>
                          ) : (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busyId === u.id || u.lockedAdmin}
                              title={u.lockedAdmin ? "Locked by admin allowlist" : undefined}
                              onClick={() => void act(u.id, "role", "EDITOR")}
                            >
                              Remove admin
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
