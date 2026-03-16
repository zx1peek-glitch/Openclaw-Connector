import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { addProfile, createDefaultProfile } from "../store/useProfileStore";
import { CheckCircle2, AlertCircle } from "lucide-react";

type Props = {
  onCreated: (profileId: string) => void;
  onCancel: () => void;
};

export function NewProfileForm({ onCreated, onCancel }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [detectedPort, setDetectedPort] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    invoke<{ token: string; port: number }>("detect_local_gateway")
      .then((result) => {
        setDetectedToken(result.token);
        setDetectedPort(result.port);
      })
      .catch(() => {})
      .finally(() => setDetecting(false));
  }, []);

  const handleSave = () => {
    if (!name.trim() || !host.trim() || !user.trim()) return;
    const profile = createDefaultProfile();
    profile.name = name.trim();
    profile.server.host = host.trim();
    profile.server.user = user.trim();
    if (detectedToken) profile.gatewayToken = detectedToken;
    if (detectedPort) {
      profile.server.localPort = detectedPort;
      profile.server.remotePort = detectedPort;
    }
    addProfile(profile);
    onCreated(profile.id);
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold">{t("profile.new")}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1.5">
            {t("profile.name")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profile.name_placeholder")}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              {t("connection.host")}
            </label>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              {t("connection.user")}
            </label>
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="root"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
        {detecting ? (
          <p className="text-sm text-muted-foreground animate-pulse">
            {t("profile.detecting")}
          </p>
        ) : detectedToken ? (
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="w-4 h-4" />
            {t("profile.auto_detected")}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            {t("profile.detect_failed")}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!name.trim() || !host.trim() || !user.trim()}>
          {t("profile.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("profile.cancel")}
        </Button>
      </div>
    </div>
  );
}
