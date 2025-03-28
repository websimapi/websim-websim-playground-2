export const config = {
    appName: "Websim Image & Theme Gen",
    description: "Generate images, customize themes, and add custom JS plugins!",
    aspectRatios: [
        { label: "Square (1:1)", value: "1:1" },
        { label: "Landscape (16:9)", value: "16:9" },
        { label: "Portrait (9:16)", value: "9:16" },
        { label: "Wide (21:9)", value: "21:9" },
        { label: "Tall (9:21)", value: "9:21" },
        { label: "Standard Photo (4:3)", value: "4:3" },
        { label: "Tall Photo (3:4)", value: "3:4" },
    ],
    defaultAspectRatio: "1:1",
    imageCollectionType: "generated_image_v1",
    themeStateKey: "currentThemeCSS_v1",
    pluginCollectionType: "custom_plugin_v2",
    enabledPluginsStorageKey: "enabledPlugins_v1",
    maxPluginFixAttempts: 3,
};