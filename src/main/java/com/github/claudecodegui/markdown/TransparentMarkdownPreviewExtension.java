package com.github.claudecodegui.markdown;

import java.awt.Color;
import java.awt.Component;
import java.awt.Container;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import javax.swing.JComponent;
import com.intellij.openapi.application.ApplicationManager;
import org.intellij.plugins.markdown.extensions.MarkdownBrowserPreviewExtension;
import org.intellij.plugins.markdown.ui.preview.MarkdownHtmlPanel;
import org.intellij.plugins.markdown.ui.preview.ResourceProvider;

/**
 * Makes JetBrains Markdown preview blend with IDE background images.
 */
public final class TransparentMarkdownPreviewExtension
        implements MarkdownBrowserPreviewExtension, ResourceProvider {
    private static final String STYLE_RESOURCE = "cc-gui/transparentMarkdownPreview.css";
    private static final List<String> STYLES = Collections.singletonList(STYLE_RESOURCE);
    private static final Color TRANSPARENT = new Color(0, 0, 0, 0);
    private static final String CSS = String.join("\n",
            "html, body {",
            "  background: transparent !important;",
            "}",
            "",
            "body,",
            ".markdown-body,",
            ".markdown-preview,",
            "#preview,",
            "#content,",
            "main,",
            "article {",
            "  background: transparent !important;",
            "}",
            "",
            "pre,",
            ".highlight pre,",
            "code {",
            "  background-color: rgba(127, 127, 127, 0.14) !important;",
            "}",
            "",
            "pre code {",
            "  background-color: transparent !important;",
            "}",
            "",
            "table,",
            "thead,",
            "tbody,",
            "tr,",
            "th,",
            "td {",
            "  background-color: transparent !important;",
            "}");

    private TransparentMarkdownPreviewExtension(JComponent previewComponent) {
        makeTransparent(previewComponent);
        ApplicationManager.getApplication().invokeLater(() -> makeTransparent(previewComponent));
    }

    @Override
    public Priority getPriority() {
        return Priority.AFTER_ALL;
    }

    @Override
    public List<String> getStyles() {
        return STYLES;
    }

    @Override
    public ResourceProvider getResourceProvider() {
        return this;
    }

    @Override
    public boolean canProvide(String resourceName) {
        return STYLE_RESOURCE.equals(resourceName);
    }

    @Override
    public Resource loadResource(String resourceName) {
        if (!canProvide(resourceName)) {
            return null;
        }
        return new Resource(CSS.getBytes(StandardCharsets.UTF_8), "text/css");
    }

    @Override
    public void dispose() {
        // Nothing to dispose.
    }

    private static void makeTransparent(Component component) {
        if (component instanceof JComponent jComponent) {
            jComponent.setOpaque(false);
            jComponent.setBackground(TRANSPARENT);
        }
        if (component instanceof Container container) {
            for (Component child : container.getComponents()) {
                makeTransparent(child);
            }
        }
    }

    /**
     * Provider registered through the Markdown plugin extension point.
     */
    public static final class Provider implements MarkdownBrowserPreviewExtension.Provider {
        @Override
        public MarkdownBrowserPreviewExtension createBrowserExtension(MarkdownHtmlPanel panel) {
            return new TransparentMarkdownPreviewExtension(panel.getComponent());
        }
    }
}
