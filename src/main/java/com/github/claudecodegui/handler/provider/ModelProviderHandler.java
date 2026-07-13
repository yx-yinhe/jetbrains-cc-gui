package com.github.claudecodegui.handler.provider;

import com.github.claudecodegui.handler.UsagePushService;
import com.github.claudecodegui.handler.core.HandlerContext;

import com.github.claudecodegui.session.SessionSendService;
import com.github.claudecodegui.skill.SlashCommandRegistry;
import com.github.claudecodegui.util.EditorFileUtils;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.util.concurrency.AppExecutorUtil;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Handles model and provider selection, reasoning effort, and slash command refresh.
 */
public class ModelProviderHandler {

    private static final Logger LOG = Logger.getInstance(ModelProviderHandler.class);
    private static final int DEFAULT_MODEL_CONTEXT_LIMIT = 200_000;
    private static final Pattern CAPACITY_SUFFIX_PATTERN =
            Pattern.compile("\\s*\\[([0-9.]+)([kKmM])\\]\\s*$");
    private static final Pattern SNAPSHOT_SUFFIX_PATTERN =
            Pattern.compile("-\\d{4}-\\d{2}-\\d{2}$");

    static final Map<String, Integer> MODEL_CONTEXT_LIMITS = new HashMap<>();
    static {
        // Claude models with 1M context (base IDs)
        MODEL_CONTEXT_LIMITS.put("claude-sonnet-5", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-sonnet-4-6", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-fable-5", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-opus-4-8", 200_000);
        MODEL_CONTEXT_LIMITS.put("claude-opus-4-6", 200_000);
        // Claude models with [1m] suffix - 1M context
        MODEL_CONTEXT_LIMITS.put("claude-sonnet-5[1m]", 1_000_000);
        MODEL_CONTEXT_LIMITS.put("claude-sonnet-4-6[1m]", 1_000_000);
        MODEL_CONTEXT_LIMITS.put("claude-fable-5[1m]", 1_000_000);
        MODEL_CONTEXT_LIMITS.put("claude-opus-4-8[1m]", 1_000_000);
        MODEL_CONTEXT_LIMITS.put("claude-opus-4-6[1m]", 1_000_000);
        // Haiku - no 1M context available
        MODEL_CONTEXT_LIMITS.put("claude-haiku-4-5", 200_000);
        // Codex/GPT models
        // Codex SDK 0.144.1 catalog: all GPT-5.6 tiers expose a 372K context window.
        MODEL_CONTEXT_LIMITS.put("gpt-5.6-sol", 372_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.6-terra", 372_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.6-luna", 372_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.4", 1_000_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.4-mini", 400_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.3-codex", 258_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.2-codex", 258_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.2", 258_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.1", 128_000);
        MODEL_CONTEXT_LIMITS.put("gpt-5.1-codex", 128_000);
        MODEL_CONTEXT_LIMITS.put("gpt-4o", 128_000);
        MODEL_CONTEXT_LIMITS.put("gpt-4o-mini", 128_000);
        MODEL_CONTEXT_LIMITS.put("gpt-4-turbo", 128_000);
        MODEL_CONTEXT_LIMITS.put("gpt-4", 8_192);
        MODEL_CONTEXT_LIMITS.put("o3", 200_000);
        MODEL_CONTEXT_LIMITS.put("o3-mini", 200_000);
        MODEL_CONTEXT_LIMITS.put("o1", 200_000);
        MODEL_CONTEXT_LIMITS.put("o1-mini", 128_000);
        MODEL_CONTEXT_LIMITS.put("o1-preview", 128_000);
    }

    private final HandlerContext context;
    private final UsagePushService usagePushService;
    private final Gson gson = new Gson();

    public ModelProviderHandler(HandlerContext context, UsagePushService usagePushService) {
        this.context = context;
        this.usagePushService = usagePushService;
    }

    public void handleSetModel(String content) {
        try {
            String model = content;
            if (content != null && !content.isEmpty()) {
                try {
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("model")) {
                        model = json.get("model").getAsString();
                    }
                } catch (Exception e) {
                    // content itself is the model
                }
            }

            LOG.info("[ModelProviderHandler] Setting model to: " + model);
            context.setCurrentModel(model);

            if (context.getSession() != null) {
                context.getSession().setModel(model);
                LOG.info("[ModelProviderHandler] Updated session model to canonical ID: " + model);
            }

            com.github.claudecodegui.notifications.ClaudeNotifier.setModel(context.getProject(), model);

            String resolvedModelForUsage = resolveConfiguredClaudeModelFromSettings(model);
            int newMaxTokens = getModelContextLimit(resolvedModelForUsage);
            LOG.info("[ModelProviderHandler] Model context limit: " + newMaxTokens
                    + " tokens for selected model: " + model
                    + ", resolved model: " + resolvedModelForUsage);

            final String confirmedModel = model;
            final String confirmedProvider = context.getCurrentProvider();
            ApplicationManager.getApplication().invokeLater(() -> {
                context.callJavaScript("window.onModelConfirmed", context.escapeJs(confirmedModel), context.escapeJs(confirmedProvider));
                usagePushService.pushUsageUpdateAfterModelChange(newMaxTokens);
            });
        } catch (Exception e) {
            LOG.error("[ModelProviderHandler] Failed to set model: " + e.getMessage(), e);
        }
    }

    public void handleSetProvider(String content) {
        try {
            String provider = content;
            if (content != null && !content.isEmpty()) {
                try {
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("provider")) {
                        provider = json.get("provider").getAsString();
                    }
                } catch (Exception e) {
                    // content itself is the provider
                }
            }

            // Capture previous provider BEFORE mutating context so we can detect
            // the leave-claude transition that needs daemon cleanup.
            String previousProvider = context.getCurrentProvider();
            LOG.info("[ModelProviderHandler] Setting provider to: " + provider
                    + " (was: " + previousProvider + ")");
            context.setCurrentProvider(provider);

            if (context.getSession() != null) {
                context.getSession().setProvider(provider);
            }

            // Bug fix (Node process leak L2): when the tab moves AWAY from Claude
            // to another SDK family (currently only Codex), the lingering Claude
            // daemon would otherwise stay alive for the rest of the tab's lifetime.
            // The daemon caches process.env, so even if the user comes back to
            // Claude with refreshed credentials, the cached env would persist —
            // shutting it down here forces the next Claude message to spawn a
            // fresh daemon. The daemon restart on return is lazy (deferred to
            // the next claude.send call), so users pay ~5–10s only when they
            // actually send the next Claude message.
            shutdownStaleClaudeDaemonIfLeavingClaude(previousProvider, provider);

            refreshSlashCommandsForProvider(provider);
            usagePushService.refreshContextBar();
        } catch (Exception e) {
            LOG.error("[ModelProviderHandler] Failed to set provider: " + e.getMessage(), e);
        }
    }

    /**
     * Pure decision predicate: should we shut down the Claude daemon when the
     * tab provider transitions from {@code previousProvider} to {@code newProvider}?
     *
     * <p>Returns true only on Claude → non-Claude transitions. Same-direction
     * reaffirmations (e.g. {@code set_provider("codex")} fired again on every
     * message send) must not restart the daemon, and Claude → Claude
     * reaffirmations must keep the warm daemon alive.
     *
     * <p>Package-private so unit tests can verify the full transition matrix
     * without spinning up a HandlerContext or ClaudeSDKBridge.
     */
    static boolean shouldShutdownClaudeDaemonOnProviderSwitch(String previousProvider, String newProvider) {
        if (!"claude".equals(previousProvider)) {
            return false;
        }
        // Empty/null newProvider means "not set yet" (initialization, race), NOT
        // "user moved away from Claude". Treating it as a leave-claude transition
        // would cause spurious daemon restarts (~5–10s) when set_provider arrives
        // before the tab has fully booted.
        if (newProvider == null || newProvider.isEmpty() || "claude".equals(newProvider)) {
            return false;
        }
        return true;
    }

    /**
     * Shut down the Claude daemon when leaving the Claude family.
     * Delegates the decision to {@link #shouldShutdownClaudeDaemonOnProviderSwitch}
     * and only performs the side effect (calling
     * {@link com.github.claudecodegui.provider.claude.ClaudeSDKBridge#shutdownDaemon()})
     * when the decision says yes and the bridge is present.
     *
     * @return true when shutdown was actually invoked
     */
    boolean shutdownStaleClaudeDaemonIfLeavingClaude(String previousProvider, String newProvider) {
        if (!shouldShutdownClaudeDaemonOnProviderSwitch(previousProvider, newProvider)) {
            return false;
        }
        if (context.getClaudeSDKBridge() == null) {
            return false;
        }
        try {
            context.getClaudeSDKBridge().shutdownDaemon();
            LOG.info("[ModelProviderHandler] Shut down Claude daemon after switching to: " + newProvider);
            return true;
        } catch (Exception e) {
            LOG.warn("[ModelProviderHandler] Failed to shut down Claude daemon on provider switch: "
                    + e.getMessage(), e);
            return false;
        }
    }

    public void handleSetReasoningEffort(String content) {
        try {
            String effort = content;
            if (content != null && !content.isEmpty()) {
                try {
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("reasoningEffort")) {
                        effort = json.get("reasoningEffort").getAsString();
                    }
                } catch (Exception e) {
                    // content itself is the effort
                }
            }

            LOG.info("[ModelProviderHandler] Setting reasoning effort to: " + effort);

            if (context.getSession() != null) {
                context.getSession().setReasoningEffort(effort);
            }
        } catch (Exception e) {
            LOG.error("[ModelProviderHandler] Failed to set reasoning effort: " + e.getMessage(), e);
        }
    }

    public void handleSetCodexFastMode(String content) {
        try {
            String mode = content;
            if (content != null && !content.isEmpty()) {
                try {
                    JsonObject json = gson.fromJson(content, JsonObject.class);
                    if (json.has("codexFastMode")) {
                        mode = json.get("codexFastMode").getAsString();
                    }
                } catch (Exception e) {
                    // content itself is the mode
                }
            }

            String serviceTier = SessionSendService.resolveEffectiveCodexServiceTier(mode, null);
            LOG.info("[ModelProviderHandler] Setting Codex fast mode to: " + mode
                    + ", serviceTier=" + (serviceTier != null ? serviceTier : "standard"));

            if (context.getSession() != null) {
                context.getSession().setCodexServiceTier(serviceTier);
            }
        } catch (Exception e) {
            LOG.error("[ModelProviderHandler] Failed to set Codex fast mode: " + e.getMessage(), e);
        }
    }

    private void refreshSlashCommandsForProvider(String provider) {
        String cwd = null;
        if (context.getSession() != null) {
            cwd = context.getSession().getCwd();
        }
        if (cwd == null) {
            cwd = context.getProject().getBasePath();
        }

        final String finalCwd = cwd;
        CompletableFuture.runAsync(() -> {
            String currentFilePath = EditorFileUtils.getCurrentEditorFilePath(context.getProject());
            var commands = SlashCommandRegistry.getCommands(provider, finalCwd, currentFilePath);
            String json = SlashCommandRegistry.toJson(commands);

            final String codexJson;
            if ("codex".equalsIgnoreCase(provider)) {
                var codexSkills = SlashCommandRegistry.getCodexSkills(finalCwd);
                codexJson = SlashCommandRegistry.toJson(codexSkills);
                LOG.info("[ModelProviderHandler] Codex skills refreshed: " + codexSkills.size() + " skills");
            } else {
                codexJson = null;
            }

            ApplicationManager.getApplication().invokeLater(() -> {
                try {
                    context.callJavaScript("updateSlashCommands", context.escapeJs(json));
                    if (codexJson != null) {
                        context.callJavaScript("window.updateDollarCommands", context.escapeJs(codexJson));
                    }
                } catch (Exception e) {
                    LOG.warn("[ModelProviderHandler] Failed to refresh slash commands: " + e.getMessage());
                }
            });
        }, AppExecutorUtil.getAppExecutorService()).exceptionally(ex -> {
            LOG.error("[ModelProviderHandler] Failed to refresh slash commands asynchronously: " + ex.getMessage(), ex);
            return null;
        });
    }

    private String resolveConfiguredClaudeModelFromSettings(String baseModel) {
        try {
            JsonObject claudeSettings = context.getSettingsService().readClaudeSettings();
            if (claudeSettings == null || !claudeSettings.has("env") || !claudeSettings.get("env").isJsonObject()) {
                return baseModel;
            }
            return resolveConfiguredClaudeModel(baseModel, claudeSettings.getAsJsonObject("env"));
        } catch (Exception e) {
            LOG.error("[ModelProviderHandler] Failed to resolve actual model name: " + e.getMessage());
        }

        return baseModel;
    }

    static String resolveConfiguredClaudeModel(String baseModel, JsonObject env) {
        if (baseModel == null || baseModel.isEmpty() || env == null) {
            return baseModel;
        }

        String mainModel = readConfiguredEnvValue(env, "ANTHROPIC_MODEL");
        if (mainModel != null) {
            return mainModel;
        }

        String lowerBaseModel = baseModel.toLowerCase();
        boolean isClaudeModel = lowerBaseModel.startsWith("claude-") || lowerBaseModel.startsWith("claude_");
        if (!isClaudeModel) {
            return baseModel;
        }

        if (lowerBaseModel.contains("opus")) {
            String mappedOpus = readConfiguredEnvValue(env, "ANTHROPIC_DEFAULT_OPUS_MODEL");
            return mappedOpus != null ? mappedOpus : baseModel;
        }
        if (lowerBaseModel.contains("haiku")) {
            String mappedHaiku = readConfiguredEnvValue(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL");
            return mappedHaiku != null ? mappedHaiku : baseModel;
        }
        if (lowerBaseModel.contains("sonnet")) {
            String mappedSonnet = readConfiguredEnvValue(env, "ANTHROPIC_DEFAULT_SONNET_MODEL");
            return mappedSonnet != null ? mappedSonnet : baseModel;
        }

        return baseModel;
    }

    private static String readConfiguredEnvValue(JsonObject env, String key) {
        if (env == null || key == null || !env.has(key) || env.get(key).isJsonNull()) {
            return null;
        }

        String value = env.get(key).getAsString();
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    public static int getModelContextLimit(String model) {
        if (model == null || model.isEmpty()) {
            return DEFAULT_MODEL_CONTEXT_LIMIT;
        }

        Matcher matcher = CAPACITY_SUFFIX_PATTERN.matcher(model);

        if (matcher.find()) {
            try {
                double value = Double.parseDouble(matcher.group(1));
                String unit = matcher.group(2).toLowerCase(Locale.ROOT);

                if ("m".equals(unit)) {
                    return (int)(value * 1_000_000);
                } else if ("k".equals(unit)) {
                    return (int)(value * 1_000);
                }
            } catch (NumberFormatException e) {
                LOG.error("Failed to parse capacity from model name: " + model);
            }
        }

        String normalizedModel = normalizeModelForContextLookup(model);
        return MODEL_CONTEXT_LIMITS.getOrDefault(normalizedModel, DEFAULT_MODEL_CONTEXT_LIMIT);
    }

    /**
     * Normalizes model aliases and dated snapshots before looking up static metadata.
     *
     * <p>Codex may report either an alias (for example {@code gpt-5.6}) or a dated
     * snapshot (for example {@code gpt-5.6-sol-2026-07-09}). The built-in context
     * table intentionally stores only the stable family IDs, so aliases must be
     * resolved to those IDs before the lookup.</p>
     */
    public static String normalizeModelForContextLookup(String model) {
        if (model == null) {
            return null;
        }

        String normalized = model.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return normalized;
        }

        // Snapshot IDs are stable model IDs with a trailing YYYY-MM-DD component.
        normalized = SNAPSHOT_SUFFIX_PATTERN.matcher(normalized).replaceFirst("");

        // Preserve an explicit GPT-5.6 tier when present. The bare GPT-5.6 alias
        // and a bare dated snapshot resolve to Sol. Unknown suffixes are left
        // untouched so they do not inherit a context limit accidentally.
        if (normalized.equals("gpt-5.6")) {
            return "gpt-5.6-sol";
        }
        if (normalized.startsWith("gpt-5.6-terra-")) {
            return "gpt-5.6-terra";
        }
        if (normalized.startsWith("gpt-5.6-luna-")) {
            return "gpt-5.6-luna";
        }
        if (normalized.startsWith("gpt-5.6-sol-")) {
            return "gpt-5.6-sol";
        }

        return normalized;
    }
}
