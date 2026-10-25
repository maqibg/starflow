"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AlertMessage } from "@/components/alert-message";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  Loader2,
  ArrowLeft,
  Settings2,
  Github,
  Trash2,
  Keyboard,
  Info,
  Sparkles,
  Clock,
  RotateCcw,
} from "lucide-react";
import { getPreferences, setPreferences, UserPreferences } from "@/lib/preferences";
import { Input } from "@/components/ui/input";

interface User {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  username?: string;
}

interface SnapshotItem {
  id: string;
  label: string;
  listCount: number;
  noteCount: number;
  repoCount: number;
  createdAt: string;
}

export function SettingsClient({ user }: { user: User }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tStars = useTranslations("stars");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [preferences, setPrefs] = useState<UserPreferences>({
    defaultSort: "starredAt",
    itemsPerPage: 50,
    compactView: false,
  });
  const [clearing, setClearing] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: "default" | "destructive";
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });
  const [alertMessage, setAlertMessage] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: "default" | "success" | "error";
  }>({
    open: false,
    title: "",
    message: "",
  });

  // AI 配置状态
  const [aiConfig, setAiConfig] = useState({
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    model: "gpt-3.5-turbo",
    enabled: false,
    hasApiKey: false,
    requestInterval: 1000,
    concurrency: 3,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

  // 定时同步状态
  const [schedule, setSchedule] = useState<{
    enabled: boolean;
    cron: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastError: string | null;
    nextRun: string | null;
    timeZone: string;
  }>({
    enabled: false,
    cron: "0 3 * * *",
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    nextRun: null,
    timeZone: "UTC",
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSyncing, setScheduleSyncing] = useState(false);

  // 整理快照状态
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [organizeClearing, setOrganizeClearing] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(getPreferences());
    fetchAiConfig();
    fetchSchedule();
    fetchSnapshots();
  }, []);

  const fetchAiConfig = async () => {
    try {
      const res = await fetch("/api/ai/config");
      if (res.ok) {
        const data = await res.json();
        setAiConfig((prev) => ({
          ...prev,
          provider: data.provider || "openai",
          baseUrl: data.baseUrl || "",
          model: data.model || "gpt-3.5-turbo",
          enabled: data.enabled || false,
          hasApiKey: data.hasApiKey || false,
          requestInterval: data.requestInterval || 1000,
          concurrency: data.concurrency || 3,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch AI config:", error);
    }
  };

  const handleSaveAiConfig = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey || undefined,
          baseUrl: aiConfig.baseUrl || undefined,
          model: aiConfig.model,
          enabled: aiConfig.enabled,
          requestInterval: aiConfig.requestInterval,
          concurrency: aiConfig.concurrency,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiConfig((prev) => ({
          ...prev,
          apiKey: "",
          hasApiKey: data.hasApiKey,
        }));
        setAlertMessage({
          open: true,
          title: t("saveSuccess"),
          message: t("aiConfigSaved"),
          variant: "success",
        });
      } else {
        throw new Error("Save failed");
      }
    } catch (error) {
      console.error("Save AI config error:", error);
      setAlertMessage({
        open: true,
        title: t("saveFailed"),
        message: t("aiConfigSaveFailed"),
        variant: "error",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleTestAiConnection = async () => {
    setAiTesting(true);
    try {
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setAlertMessage({
          open: true,
          title: t("connectionSuccess"),
          message: t("aiServiceNormal"),
          variant: "success",
        });
      } else {
        setAlertMessage({
          open: true,
          title: t("connectionFailed"),
          message: data.error || t("cannotConnectAi"),
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Test AI connection error:", error);
      setAlertMessage({
        open: true,
        title: t("testFailed"),
        message: t("testError"),
        variant: "error",
      });
    } finally {
      setAiTesting(false);
    }
  };

  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    const updated = { ...preferences, [key]: value };
    setPrefs(updated);
    setPreferences({ [key]: value });
  };

  const handleExport = async (format: "json" | "csv") => {
    try {
      const res = await fetch(`/api/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `starflow-export-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      setAlertMessage({
        open: true,
        title: t("operationFailed"),
        message: t("exportFailed"),
        variant: "error",
      });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (res.ok) {
        let message = t("importSuccess", {
          listsCreated: result.results.listsCreated,
          reposUpdated: result.results.reposUpdated,
          notesCreated: result.results.notesCreated,
        });
        if (result.results.listsSkipped > 0) {
          message += " " + t("importSkipped", { listsSkipped: result.results.listsSkipped });
        }
        setImportResult({
          success: true,
          message,
        });
      } else {
        setImportResult({
          success: false,
          message: result.error || t("importFailed"),
        });
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        message: t("importFormatError"),
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClearNotes = async () => {
    setConfirmDialog({
      open: true,
      title: t("clearAllNotes"),
      description: t("clearNotesConfirm"),
      variant: "destructive",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, open: false });
        setClearing("notes");
        try {
          await fetch("/api/notes", { method: "DELETE" });
          router.refresh();
          setAlertMessage({
            open: true,
            title: t("operationSuccess"),
            message: t("allNotesDeleted"),
            variant: "success",
          });
        } catch (error) {
          console.error("Clear notes error:", error);
          setAlertMessage({
            open: true,
            title: t("operationFailed"),
            message: t("deleteFailed"),
            variant: "error",
          });
        } finally {
          setClearing(null);
        }
      },
    });
  };

  const handleClearLists = async () => {
    setConfirmDialog({
      open: true,
      title: t("clearAllLists"),
      description: t("clearListsConfirm"),
      variant: "destructive",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, open: false });
        setClearing("lists");
        try {
          await fetch("/api/lists/all", { method: "DELETE" });
          router.refresh();
          setAlertMessage({
            open: true,
            title: t("operationSuccess"),
            message: t("allListsDeleted"),
            variant: "success",
          });
        } catch (error) {
          console.error("Clear lists error:", error);
          setAlertMessage({
            open: true,
            title: t("operationFailed"),
            message: t("deleteFailed"),
            variant: "error",
          });
        } finally {
          setClearing(null);
        }
      },
    });
  };

  const handleResetData = async () => {
    setConfirmDialog({
      open: true,
      title: t("resetAllData"),
      description: t("resetDataConfirm"),
      variant: "destructive",
      onConfirm: () => {
        setConfirmDialog({
          open: true,
          title: t("confirmAgain"),
          description: t("resetDataConfirm2"),
          variant: "destructive",
          onConfirm: async () => {
            setConfirmDialog({ ...confirmDialog, open: false });
            setClearing("reset");
            try {
              await fetch("/api/reset", { method: "POST" });
              setAlertMessage({
                open: true,
                title: t("operationSuccess"),
                message: t("dataResetSuccess"),
                variant: "success",
              });
              setTimeout(() => {
                router.push("/stars");
              }, 1500);
            } catch (error) {
              console.error("Reset error:", error);
              setAlertMessage({
                open: true,
                title: t("operationFailed"),
                message: t("resetFailed"),
                variant: "error",
              });
            } finally {
              setClearing(null);
            }
          },
        });
      },
    });
  };

  const fetchSchedule = async () => {
    try {
      const res = await fetch("/api/sync-schedule");
      if (!res.ok) return;
      const data = await res.json();
      setSchedule({
        enabled: Boolean(data.enabled),
        cron: data.cron || "0 3 * * *",
        lastRunAt: data.lastRunAt ?? null,
        lastStatus: data.lastStatus ?? null,
        lastError: data.lastError ?? null,
        nextRun: data.nextRun ?? null,
        timeZone: data.timeZone || "UTC",
      });
    } catch (error) {
      console.error("Failed to fetch sync schedule:", error);
    }
  };

  const fetchSnapshots = async () => {
    setSnapshotsLoading(true);
    try {
      const res = await fetch("/api/organize/snapshots");
      if (!res.ok) return;
      const data = await res.json();
      setSnapshots(Array.isArray(data.snapshots) ? data.snapshots : []);
    } catch (error) {
      console.error("Failed to fetch snapshots:", error);
    } finally {
      setSnapshotsLoading(false);
    }
  };

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const res = await fetch("/api/sync-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: schedule.enabled,
          cron: schedule.cron,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlertMessage({
          open: true,
          title: t("operationFailed"),
          message: `${t("schedInvalid")}: ${data.error || t("schedSaveFailed")}`,
          variant: "error",
        });
        return;
      }
      setSchedule((prev) => ({
        ...prev,
        enabled: Boolean(data.enabled),
        cron: data.cron || prev.cron,
        nextRun: data.nextRun ?? null,
        timeZone: data.timeZone || prev.timeZone,
      }));
      setAlertMessage({
        open: true,
        title: t("operationSuccess"),
        message: t("schedSaved"),
        variant: "success",
      });
    } catch (error) {
      console.error("Save schedule error:", error);
      setAlertMessage({
        open: true,
        title: t("operationFailed"),
        message: t("schedSaveFailed"),
        variant: "error",
      });
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setScheduleSyncing(true);
    try {
      const res = await fetch("/api/sync-schedule/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAlertMessage({
          open: true,
          title: t("operationFailed"),
          message: data.error || t("schedSyncFailed"),
          variant: "error",
        });
        return;
      }
      setAlertMessage({
        open: true,
        title: t("operationSuccess"),
        message: t("schedSynced", { count: data.count ?? 0 }),
        variant: "success",
      });
      fetchSchedule();
      fetchSnapshots();
      router.refresh();
    } catch (error) {
      console.error("Sync now error:", error);
      setAlertMessage({
        open: true,
        title: t("operationFailed"),
        message: t("schedSyncFailed"),
        variant: "error",
      });
    } finally {
      setScheduleSyncing(false);
    }
  };

  const handleOrganizeClear = (target: "all" | "lists" | "notes") => {
    const targetLabel =
      target === "lists"
        ? t("orgTargetLists")
        : target === "notes"
          ? t("orgTargetNotes")
          : t("orgTargetAll");
    const title =
      target === "lists"
        ? t("orgClearLists")
        : target === "notes"
          ? t("orgClearNotes")
          : t("orgClearAll");

    setConfirmDialog({
      open: true,
      title,
      description: t("orgClearConfirm", { target: targetLabel }),
      variant: "destructive",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, open: false });
        setOrganizeClearing(target);
        try {
          const res = await fetch("/api/organize/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setAlertMessage({
              open: true,
              title: t("operationFailed"),
              message: data.error || t("orgClearFailed"),
              variant: "error",
            });
            return;
          }
          setAlertMessage({
            open: true,
            title: t("operationSuccess"),
            message: t("orgCleared", { target: targetLabel }),
            variant: "success",
          });
          fetchSnapshots();
          router.refresh();
        } catch (error) {
          console.error("Organize clear error:", error);
          setAlertMessage({
            open: true,
            title: t("operationFailed"),
            message: t("orgClearFailed"),
            variant: "error",
          });
        } finally {
          setOrganizeClearing(null);
        }
      },
    });
  };

  const handleRestore = (snapshotId?: string) => {
    const target = snapshotId
      ? snapshots.find((item) => item.id === snapshotId)
      : snapshots[0];

    if (!target) {
      setAlertMessage({
        open: true,
        title: t("operationFailed"),
        message: t("orgNoSnapshots"),
        variant: "error",
      });
      return;
    }

    setConfirmDialog({
      open: true,
      title: t("orgRestoreLatest"),
      description: t("orgRestoreConfirm", { label: target.label }),
      variant: "destructive",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, open: false });
        setRestoringId(target.id);
        try {
          const res = await fetch("/api/organize/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snapshotId: target.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setAlertMessage({
              open: true,
              title: t("operationFailed"),
              message: data.error || t("orgRestoreFailed"),
              variant: "error",
            });
            return;
          }
          setAlertMessage({
            open: true,
            title: t("operationSuccess"),
            message: t("orgRestored", {
              lists: data.restoredLists ?? 0,
              notes: data.restoredNotes ?? 0,
            }),
            variant: "success",
          });
          fetchSnapshots();
          router.refresh();
        } catch (error) {
          console.error("Restore snapshot error:", error);
          setAlertMessage({
            open: true,
            title: t("operationFailed"),
            message: t("orgRestoreFailed"),
            variant: "error",
          });
        } finally {
          setRestoringId(null);
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl py-8 mx-auto px-4">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => router.push("/stars")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("back")}
        </Button>

        <h1 className="text-2xl font-bold mb-6">{t("title")}</h1>

        {/* Display Preferences */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {t("displayPreferences")}
            </CardTitle>
            <CardDescription>
              {t("displayPreferencesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("defaultSort")}</Label>
                <p className="text-sm text-muted-foreground">{t("defaultSortDesc")}</p>
              </div>
              <Select
                value={preferences.defaultSort}
                onValueChange={(value) => updatePreference("defaultSort", value as UserPreferences["defaultSort"])}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starredAt">{tStars("sortBy.starredAt")}</SelectItem>
                  <SelectItem value="stargazersCount">{tStars("sortBy.stargazersCount")}</SelectItem>
                  <SelectItem value="pushedAt">{tStars("sortBy.pushedAt")}</SelectItem>
                  <SelectItem value="name">{tStars("sortBy.name")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t("itemsPerPage")}</Label>
                <p className="text-sm text-muted-foreground">{t("itemsPerPageDesc")}</p>
              </div>
              <Select
                value={preferences.itemsPerPage.toString()}
                onValueChange={(value) => updatePreference("itemsPerPage", parseInt(value))}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t("compactView")}</Label>
                <p className="text-sm text-muted-foreground">{t("compactViewDesc")}</p>
              </div>
              <Switch
                checked={preferences.compactView}
                onCheckedChange={(checked) => updatePreference("compactView", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* GitHub Account */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              {t("githubAccount")}
            </CardTitle>
            <CardDescription>
              {t("githubAccountDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {user.image && (
                <img
                  src={user.image}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">
                  @{user.username || user.email}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {t("exportData")}
            </CardTitle>
            <CardDescription>
              {t("exportDataDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => handleExport("json")}
              className="flex-1"
            >
              <FileJson className="mr-2 h-4 w-4" />
              {t("exportJson")}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport("csv")}
              className="flex-1"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {t("exportCsv")}
            </Button>
          </CardContent>
        </Card>

        {/* Import */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              {t("importData")}
            </CardTitle>
            <CardDescription>
              {t("importDataDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
              id="import-file"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("importing")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("selectJsonFile")}
                </>
              )}
            </Button>

            {importResult && (
              <div
                className={`mt-4 p-3 rounded-md text-sm ${
                  importResult.success
                    ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                {importResult.message}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {t("dataManagement")}
            </CardTitle>
            <CardDescription>
              {t("dataManagementDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("clearAllNotes")}</p>
                <p className="text-sm text-muted-foreground">{t("clearAllNotesDesc")}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearNotes}
                disabled={clearing !== null}
              >
                {clearing === "notes" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("clear")
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t("clearAllLists")}</p>
                <p className="text-sm text-muted-foreground">{t("clearAllListsDesc")}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearLists}
                disabled={clearing !== null}
              >
                {clearing === "lists" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("clear")
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <p className="font-medium text-destructive">{t("resetAllData")}</p>
                <p className="text-sm text-muted-foreground">{t("resetAllDataDesc")}</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleResetData}
                disabled={clearing !== null}
              >
                {clearing === "reset" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("reset")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Sync */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("schedTitle")}
            </CardTitle>
            <CardDescription>{t("schedDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("schedEnable")}</Label>
                <p className="text-sm text-muted-foreground">
                  {t("schedEnableDesc")}
                </p>
              </div>
              <Switch
                checked={schedule.enabled}
                onCheckedChange={(checked) =>
                  setSchedule((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron-expression">{t("schedCron")}</Label>
              <Input
                id="cron-expression"
                value={schedule.cron}
                onChange={(event) =>
                  setSchedule((prev) => ({ ...prev, cron: event.target.value }))
                }
                placeholder="0 0 3 * * ?"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t("schedCronHelp")}
              </p>
            </div>

            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("schedNextRun")}</span>
                <span className="truncate">
                  {schedule.enabled && schedule.nextRun ? schedule.nextRun : "-"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t("schedLastRun")}</span>
                <span className="truncate">
                  {schedule.lastRunAt || t("schedNeverRun")}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {t("schedLastResult")}
                </span>
                <span
                  className={`truncate ${
                    schedule.lastStatus === "error" ? "text-destructive" : ""
                  }`}
                >
                  {schedule.lastStatus === "success"
                    ? t("schedLastSuccess")
                    : schedule.lastStatus === "error"
                      ? t("schedLastError", { error: schedule.lastError || "-" })
                      : "-"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {t("schedTimeZone", { zone: schedule.timeZone })}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveSchedule} disabled={scheduleSaving}>
                {scheduleSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t("schedSave")}
              </Button>
              <Button
                variant="outline"
                onClick={handleSyncNow}
                disabled={scheduleSyncing}
              >
                {scheduleSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t("schedSyncNow")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Organize & Restore */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              {t("orgTitle")}
            </CardTitle>
            <CardDescription>{t("orgDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("orgClearAll")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("orgClearAllDesc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOrganizeClear("all")}
                disabled={organizeClearing !== null}
              >
                {organizeClearing === "all" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("clear")
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("orgClearLists")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("orgClearListsDesc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOrganizeClear("lists")}
                disabled={organizeClearing !== null}
              >
                {organizeClearing === "lists" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("clear")
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("orgClearNotes")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("orgClearNotesDesc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOrganizeClear("notes")}
                disabled={organizeClearing !== null}
              >
                {organizeClearing === "notes" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t("clear")
                )}
              </Button>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{t("orgRestoreLatest")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("orgRestoreDesc")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleRestore()}
                  disabled={
                    snapshotsLoading ||
                    snapshots.length === 0 ||
                    restoringId !== null
                  }
                >
                  {restoringId !== null ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("orgRestore")
                  )}
                </Button>
              </div>

              {snapshotsLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t("orgLoading")}
                </p>
              ) : snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("orgNoSnapshots")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {snapshots.map((snapshot) => (
                    <li
                      key={snapshot.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{snapshot.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("orgSnapshotMeta", {
                            lists: snapshot.listCount,
                            notes: snapshot.noteCount,
                            repos: snapshot.repoCount,
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(snapshot.id)}
                        disabled={restoringId !== null}
                      >
                        {restoringId === snapshot.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("orgRestore")
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t("aiClassification")}
            </CardTitle>
            <CardDescription>
              {t("aiClassificationDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("enableAi")}</Label>
                <p className="text-sm text-muted-foreground">{t("enableAiDesc")}</p>
              </div>
              <Switch
                checked={aiConfig.enabled}
                onCheckedChange={(checked) =>
                  setAiConfig((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t("aiProvider")}</Label>
              <Select
                value={aiConfig.provider}
                onValueChange={(value) =>
                  setAiConfig((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">{t("aiProviderOpenai")}</SelectItem>
                  <SelectItem value="ollama">{t("aiProviderOllama")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("aiProviderDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("apiEndpoint")}</Label>
              <Input
                type="url"
                placeholder={aiConfig.provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"}
                value={aiConfig.baseUrl}
                onChange={(e) =>
                  setAiConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("apiEndpointDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("apiKey")} {aiConfig.hasApiKey && <span className="text-green-600">({t("apiKeyConfigured")})</span>}</Label>
              <Input
                type="password"
                placeholder={aiConfig.hasApiKey ? "••••••••" : "sk-..."}
                value={aiConfig.apiKey}
                onChange={(e) =>
                  setAiConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t("model")}</Label>
              <Input
                type="text"
                placeholder="gpt-3.5-turbo"
                value={aiConfig.model}
                onChange={(e) =>
                  setAiConfig((prev) => ({ ...prev, model: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("modelDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("requestInterval")}</Label>
              <Input
                type="number"
                placeholder="1000"
                min={100}
                max={10000}
                step={100}
                value={aiConfig.requestInterval}
                onChange={(e) =>
                  setAiConfig((prev) => ({ ...prev, requestInterval: parseInt(e.target.value) || 1000 }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("requestIntervalDesc")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("concurrency")}</Label>
              <Input
                type="number"
                placeholder="3"
                min={1}
                max={10}
                step={1}
                value={aiConfig.concurrency}
                onChange={(e) =>
                  setAiConfig((prev) => ({ ...prev, concurrency: parseInt(e.target.value) || 3 }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("concurrencyDesc")}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSaveAiConfig}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  t("saveConfig")
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleTestAiConnection}
                disabled={aiTesting || !aiConfig.hasApiKey}
              >
                {aiTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("testing")}
                  </>
                ) : (
                  t("testConnection")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Keyboard Shortcuts */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              {t("keyboardShortcuts")}
            </CardTitle>
            <CardDescription>
              {t("keyboardShortcutsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("focusSearch")}</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">/</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("syncRepos")}</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">r</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("toggleTheme")}</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">t</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("scrollToTop")}</span>
                <kbd className="px-2 py-1 bg-muted rounded text-xs">g g</kbd>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              {t("about")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("version")}</span>
                <span>1.3.1</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("license")}</span>
                <span>MIT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("projectUrl")}</span>
                <a
                  href="https://github.com/GEMILUXVII/starflow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />

      <AlertMessage
        open={alertMessage.open}
        onOpenChange={(open) => setAlertMessage({ ...alertMessage, open })}
        title={alertMessage.title}
        message={alertMessage.message}
        variant={alertMessage.variant}
      />
    </div>
  );
}
