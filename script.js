import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { config } from './config.js';

// --- Websim Socket Setup ---
const room = typeof WebsimSocket !== 'undefined' ? new WebsimSocket() : null;
if (!room) {
    console.error("WebsimSocket not found. Multiplayer features disabled.");
}
// -------------------------

// --- LLM Prompts ---
const CSS_SYSTEM_PROMPT = `You are an expert CSS designer... Respond ONLY with the raw CSS code.`; // Keep existing prompt
const JS_FIX_SYSTEM_PROMPT = `You are an expert JavaScript programmer. The user provided the following JavaScript code, but it produced an error when tested.
Analyze the code and the error message, then provide a corrected version of the JavaScript code.
Respond ONLY with the raw, corrected JavaScript code. Do not include explanations, introductory text, markdown code fences like \`\`\`javascript ... \`\`\`, or any characters before or after the valid JS code.
If you cannot determine a fix or the error is unclear, return the original code.`;

// --- Helper Functions ---
const getAvatarUrl = (username) => `https://images.websim.ai/avatar/${username}`;

// --- Sandboxed Code Tester ---
// Returns { success: true } or { success: false, error: Error }
const testPluginCode = (code) => {
    try {
        // Using new Function for slightly safer execution than eval
        // We don't execute it here, just check if it parses and is callable.
        // Actual execution happens when enabled.
        const func = new Function(code);
        // Optional: Perform a minimal test execution if needed, e.g., func.call({})
        console.log("Plugin code syntax validation successful.");
        return { success: true };
    } catch (error) {
        console.error("Plugin code validation failed:", error);
        return { success: false, error };
    }
};

// --- Main App Component ---
const App = () => {
    // --- Existing State ---
    const [prompt, setPrompt] = React.useState('');
    const [aspectRatio, setAspectRatio] = React.useState(config.defaultAspectRatio);
    const [currentImageUrl, setCurrentImageUrl] = React.useState(null);
    const [isLoadingImage, setIsLoadingImage] = React.useState(false);
    const [imageError, setImageError] = React.useState(null);
    const [galleryImages, setGalleryImages] = React.useState([]);
    const [isGalleryLoading, setIsGalleryLoading] = React.useState(true);
    const [themePrompt, setThemePrompt] = React.useState('');
    const [currentThemeCss, setCurrentThemeCss] = React.useState('');
    const [isLoadingTheme, setIsLoadingTheme] = React.useState(false);
    const [themeError, setThemeError] = React.useState(null);
    const [currentUser, setCurrentUser] = React.useState(null);
    const [isRoomInitialized, setIsRoomInitialized] = React.useState(false);

    // --- Plugin State ---
    const [pluginName, setPluginName] = React.useState('');
    const [pluginCode, setPluginCode] = React.useState('');
    const [isLoadingPlugin, setIsLoadingPlugin] = React.useState(false);
    const [pluginError, setPluginError] = React.useState(null);
    const [pluginSuccessMessage, setPluginSuccessMessage] = React.useState('');
    const [allPlugins, setAllPlugins] = React.useState([]);
    const [isPluginListLoading, setIsPluginListLoading] = React.useState(true);
    const [enabledPluginIds, setEnabledPluginIds] = React.useState(() => {
        // Load enabled plugins from localStorage on initial render
        try {
            const stored = localStorage.getItem(config.enabledPluginsStorageKey);
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch (e) {
            console.error("Error reading enabled plugins from localStorage:", e);
            return new Set();
        }
    });

    // --- Ref to track executed plugin functions ---
    const executedPluginFunctions = React.useRef({});

    // --- Initialize Room and Subscriptions ---
    React.useEffect(() => {
        if (!room) return;

        const initializeRoom = async () => {
            try {
                await room.initialize();
                console.log("Websim room initialized.");
                setIsRoomInitialized(true);

                // Fetch current user info *after* initialization
                 if (room.clientId && room.peers[room.clientId]) {
                    setCurrentUser(room.peers[room.clientId]);
                } else {
                     // Fallback if user info not immediately available in peers
                    if (typeof websim !== 'undefined' && websim.auth?.getCurrentUser) {
                        websim.auth.getCurrentUser().then(user => {
                             setCurrentUser(user);
                         }).catch(err => console.error("Error getting current user:", err));
                     }
                }


                // --- Theme Handling ---
                const initialRoomState = room.roomState;
                if (initialRoomState?.[config.themeStateKey]) {
                    setCurrentThemeCss(initialRoomState[config.themeStateKey]);
                }
                const unsubscribeRoomState = room.subscribeRoomState((roomState) => {
                    console.log("Room state updated (Theme):", roomState);
                    setCurrentThemeCss(roomState?.[config.themeStateKey] || '');
                });

                // --- Fetch and Subscribe to Gallery Images ---
                const imageCollection = room.collection(config.imageCollectionType);
                setIsGalleryLoading(true);
                const initialImages = imageCollection.getList().reverse();
                setGalleryImages(initialImages);
                setIsGalleryLoading(false);
                const unsubscribeGallery = imageCollection.subscribe((updatedImages) => {
                    setGalleryImages(updatedImages.reverse());
                    setIsGalleryLoading(false);
                });

                // --- Fetch and Subscribe to Plugins ---
                const pluginCollection = room.collection(config.pluginCollectionType);
                setIsPluginListLoading(true);
                const initialPlugins = pluginCollection.getList().reverse(); // Show newest first in list
                setAllPlugins(initialPlugins);
                setIsPluginListLoading(false);
                console.log("Initial plugins loaded:", initialPlugins.length, "plugins");
                const unsubscribePlugins = pluginCollection.subscribe((updatedPlugins) => {
                    console.log("Plugins updated:", updatedPlugins.length, "plugins");
                    setAllPlugins(updatedPlugins.reverse());
                    setIsPluginListLoading(false);

                    // Prune functions for deleted plugins
                    const currentPluginIds = new Set(updatedPlugins.map(p => p.id));
                    Object.keys(executedPluginFunctions.current).forEach(pluginId => {
                        if (!currentPluginIds.has(pluginId)) {
                            delete executedPluginFunctions.current[pluginId];
                            console.log(`Removed executed function reference for deleted plugin ${pluginId}`);
                        }
                    });
                });


                // Cleanup subscriptions on unmount
                return () => {
                    console.log("Cleaning up subscriptions.");
                    unsubscribeRoomState();
                    unsubscribeGallery();
                    unsubscribePlugins();
                };

            } catch (error) {
                console.error("Failed to initialize Websim room:", error);
                setImageError("Failed to connect to multiplayer service.");
                setThemeError("Failed to connect to multiplayer service.");
                setPluginError("Failed to connect to multiplayer service.");
            }
        };

        initializeRoom();

    }, [room]); // Dependency array includes room


    // --- Image Generation Handler (Existing) ---
    const handleGenerateImage = async () => {
        // ... (existing code - no changes needed) ...
         if (!prompt.trim()) {
            setImageError("Please enter a prompt.");
            return;
        }
        if (typeof websim === 'undefined' || !websim.imageGen) {
            setImageError("Websim image generation tool is not available.");
            return;
        }
        if (!room || !isRoomInitialized) {
            setImageError("Multiplayer service not connected. Cannot save image.");
            return;
        }

        setIsLoadingImage(true);
        setImageError(null);
        setCurrentImageUrl(null);

        try {
            console.log("Generating image for prompt:", prompt, "with aspect ratio:", aspectRatio);
            const result = await websim.imageGen({ prompt, aspect_ratio: aspectRatio });
            console.log("Image generated:", result);

            if (result && result.url) {
                setCurrentImageUrl(result.url);

                console.log("Saving image record to collection:", config.imageCollectionType);
                await room.collection(config.imageCollectionType).create({
                    prompt: prompt,
                    imageUrl: result.url,
                    aspectRatio: aspectRatio,
                });
                console.log("Image record saved.");

            } else {
                setImageError("Failed to generate image. Unexpected response format.");
            }
        } catch (err) {
            console.error("Error generating image or saving record:", err);
            setImageError(`Error: ${err.message || 'An unknown error occurred.'}`);
        } finally {
            setIsLoadingImage(false);
        }
    };

    // --- Theme Generation Handler (Existing) ---
    const handleGenerateTheme = async () => {
        // ... (existing code - no changes needed) ...
        if (!themePrompt.trim()) {
            setThemeError("Please enter a theme description.");
            return;
        }
        if (typeof websim === 'undefined' || !websim.chat?.completions?.create) {
            setThemeError("Websim AI chat tool is not available.");
            return;
        }
        if (!room || !isRoomInitialized) {
            setThemeError("Multiplayer service not connected. Cannot apply theme globally.");
            return;
        }

        setIsLoadingTheme(true);
        setThemeError(null);

        try {
            console.log("Generating theme for prompt:", themePrompt);
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "system", content: CSS_SYSTEM_PROMPT },
                    { role: "user", content: themePrompt },
                ],
            });

            const generatedCss = completion.content?.trim();

            if (generatedCss) {
                console.log("CSS generated:", generatedCss.substring(0, 100) + "..."); // Log snippet
                if (generatedCss.includes('{') && generatedCss.includes('}')) {
                    console.log("Updating room state with new theme CSS.");
                    await room.updateRoomState({ [config.themeStateKey]: generatedCss });
                    setThemePrompt(''); // Clear prompt on success
                } else {
                    throw new Error("Generated content doesn't look like valid CSS.");
                }
            } else {
                throw new Error("LLM returned empty content.");
            }

        } catch (err) {
            console.error("Error generating theme or updating room state:", err);
            setThemeError(`Theme generation failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsLoadingTheme(false);
        }
    };

    // --- Plugin Creation Handler ---
    const handleCreatePlugin = async () => {
        if (!pluginName.trim() || !pluginCode.trim()) {
            setPluginError("Please provide both a name and JavaScript code for the plugin.");
            return;
        }
        if (typeof websim === 'undefined' || !websim.chat?.completions?.create) {
            setPluginError("Websim AI chat tool is not available for potential code fixing.");
            return;
        }
         if (!room || !isRoomInitialized) {
            setPluginError("Multiplayer service not connected. Cannot save plugin.");
            return;
        }

        setIsLoadingPlugin(true);
        setPluginError(null);
        setPluginSuccessMessage('');

        let currentCode = pluginCode;
        let attempts = 0;
        let isValid = false;
        let lastError = null;

        while (attempts < config.maxPluginFixAttempts) {
            console.log(`Testing plugin code (Attempt ${attempts + 1})...`);
            setPluginError(`Testing code (Attempt ${attempts + 1}/${config.maxPluginFixAttempts})...`); // Give feedback
            const testResult = testPluginCode(currentCode);

            if (testResult.success) {
                isValid = true;
                console.log("Plugin code validated successfully.");
                setPluginError(null); // Clear testing message
                break;
            } else {
                lastError = testResult.error;
                console.warn(`Attempt ${attempts + 1} failed:`, lastError.message);
                 setPluginError(`Attempt ${attempts + 1} failed: ${lastError.message}. Trying to fix with AI...`); // Update feedback

                // Attempt to fix with LLM
                try {
                    console.log("Requesting LLM fix for plugin code...");
                    const completion = await websim.chat.completions.create({
                        messages: [
                            { role: "system", content: JS_FIX_SYSTEM_PROMPT },
                            {
                                role: "user",
                                content: `Code:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nError:\n${lastError.name}: ${lastError.message}\n${lastError.stack || ''}`
                            },
                        ],
                    });

                    const fixedCode = completion.content?.trim();
                    if (fixedCode && fixedCode !== currentCode) {
                         console.log("LLM provided potential fix.");
                         currentCode = fixedCode;
                         // Optional: Show the user the fixed code? For now, just retry.
                    } else {
                        console.log("LLM did not provide a fix or returned original code. Stopping attempts.");
                        setPluginError(`AI could not fix the code after attempt ${attempts + 1}. Error: ${lastError.message}`);
                        break; // Stop if LLM doesn't help
                    }
                } catch (llmError) {
                    console.error("Error calling LLM for code fix:", llmError);
                    setPluginError(`Error trying to fix code with AI: ${llmError.message}`);
                    break; // Stop if LLM call fails
                }
            }
            attempts++;
        } // End while loop

        if (isValid) {
             setPluginError(null); // Clear any "fixing" messages
            try {
                console.log("Saving validated plugin to collection:", config.pluginCollectionType);
                await room.collection(config.pluginCollectionType).create({
                    name: pluginName,
                    code: currentCode, // Save the validated (potentially fixed) code
                });
                console.log("Plugin saved successfully.");
                setPluginSuccessMessage(`Plugin "${pluginName}" created successfully!`);
                setPluginName('');
                setPluginCode('');
            } catch (saveError) {
                console.error("Error saving plugin:", saveError);
                setPluginError(`Failed to save plugin: ${saveError.message}`);
            }
        } else {
            // If it's still not valid after attempts
            if (!pluginError?.includes('AI could not fix')) { // Avoid overriding specific AI failure message
                 setPluginError(`Failed to validate plugin code after ${attempts} attempts. Last error: ${lastError?.message || 'Unknown validation error'}`);
            }
        }

        setIsLoadingPlugin(false);
    };

    // --- Plugin Deletion Handler ---
     const handleDeletePlugin = async (pluginId) => {
        if (!room || !isRoomInitialized) {
            setPluginError("Multiplayer service not connected. Cannot delete plugin.");
            return;
        }
         if (!confirm("Are you sure you want to delete this plugin? This cannot be undone.")) {
            return;
        }

        // Optimistic UI update (optional but good UX)
        // setAllPlugins(prev => prev.filter(p => p.id !== pluginId));

        try {
            await room.collection(config.pluginCollectionType).delete(pluginId);
            console.log(`Plugin ${pluginId} deleted successfully.`);
            // The subscription will update the list, no need for manual state update if optimistic wasn't done
        } catch (err) {
            console.error(`Failed to delete plugin ${pluginId}:`, err);
            setPluginError(`Failed to delete plugin: ${err.message}. You might not be the owner.`);
            // Revert optimistic update if it failed (if implemented)
            // Consider refetching or relying on subscription to correct the list
        }
    };


    // --- Plugin Enable/Disable Handler ---
    const handleTogglePlugin = (pluginId) => {
        setEnabledPluginIds(prevEnabledIds => {
            const newEnabledIds = new Set(prevEnabledIds);
            if (newEnabledIds.has(pluginId)) {
                newEnabledIds.delete(pluginId);
                // Remove function reference if disabled
                delete executedPluginFunctions.current[pluginId];
                console.log(`Plugin ${pluginId} disabled.`);
            } else {
                newEnabledIds.add(pluginId);
                 console.log(`Plugin ${pluginId} enabled.`);
                 // Execution will happen in the useEffect below
            }
            // Persist to localStorage
            try {
                localStorage.setItem(config.enabledPluginsStorageKey, JSON.stringify(Array.from(newEnabledIds)));
            } catch (e) {
                console.error("Error saving enabled plugins to localStorage:", e);
            }
            return newEnabledIds;
        });
    };


   // --- Effect to Execute Enabled Plugins ---
    React.useEffect(() => {
        console.log("Evaluating enabled plugins...");
        enabledPluginIds.forEach(pluginId => {
            // Only execute if not already executed or if the code has changed (re-fetched)
             if (!executedPluginFunctions.current[pluginId]) {
                const plugin = allPlugins.find(p => p.id === pluginId);
                if (plugin && plugin.code) {
                    console.log(`Executing plugin: ${plugin.name} (${pluginId})`);
                    try {
                        // Create the function
                        const pluginFunc = new Function(plugin.code);
                         // Store the function reference before executing
                        executedPluginFunctions.current[pluginId] = pluginFunc;
                        // Execute the function - consider context if needed (.call(window) or similar)
                        pluginFunc();
                        console.log(`Plugin ${plugin.name} executed successfully.`);
                    } catch (error) {
                        console.error(`Error executing plugin ${plugin.name} (${pluginId}):`, error);
                        // Optionally disable the faulty plugin automatically
                        // handleTogglePlugin(pluginId);
                        // Remove the faulty function reference
                        delete executedPluginFunctions.current[pluginId];
                        // Display error to user?
                         setPluginError(prev => `${prev ? prev + '\n' : ''}Error executing plugin "${plugin.name}": ${error.message}`);
                    }
                } else {
                     // Plugin code might not be loaded yet or plugin was deleted
                     console.warn(`Plugin code for enabled plugin ${pluginId} not found.`);
                     delete executedPluginFunctions.current[pluginId]; // Clean up ref
                 }
            } else {
                 console.log(`Plugin ${pluginId} already executed, skipping.`);
            }
        });

         // Clean up functions for plugins that are no longer enabled but might still be in the ref
         Object.keys(executedPluginFunctions.current).forEach(executedId => {
             if (!enabledPluginIds.has(executedId)) {
                 delete executedPluginFunctions.current[executedId];
                 console.log(`Cleaned up function reference for disabled plugin ${executedId}`);
             }
         });


    }, [enabledPluginIds, allPlugins]); // Re-run when enabled list or the plugins themselves change


    // --- Render ---
    return (
        <div key="image-theme-plugin-generator">
            {/* Dynamic Theme Styles */}
            <style>{currentThemeCss}</style>

            <h1>{config.appName}</h1>
            <p>{config.description}</p>

            {/* --- Image Generation (Existing) --- */}
            <h2>Generate Image</h2>
            <div className="controls-container">
                {/* ... existing image controls ... */}
                 <div className="input-group">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter image prompt (e.g., 'a cat riding a skateboard')"
                        disabled={isLoadingImage || !isRoomInitialized}
                        aria-label="Image prompt input"
                    />
                    <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        disabled={isLoadingImage || !isRoomInitialized}
                        aria-label="Select aspect ratio"
                    >
                        {config.aspectRatios.map(ratio => (
                            <option key={ratio.value} value={ratio.value}>
                                {ratio.label}
                            </option>
                        ))}
                    </select>
                    <button onClick={handleGenerateImage} disabled={isLoadingImage || !prompt.trim() || !isRoomInitialized} aria-live="polite">
                        {isLoadingImage ? 'Generating...' : 'Generate Image'}
                    </button>
                </div>
            </div>
            {imageError && <p className="error-message">{imageError}</p>}
            {isLoadingImage && (
                <div className="loading-indicator">
                    <div className="spinner"></div>
                    <p>Generating & Saving Image...</p>
                </div>
            )}
            {currentImageUrl && !isLoadingImage && (
                <div className="current-image-section">
                     <h3>Last Generated Image:</h3>
                     <div className="image-container">
                         <img src={currentImageUrl} alt="Most recently generated image" />
                     </div>
                 </div>
            )}

             {/* --- Theme Generation (Existing) --- */}
            <h2>Customize Theme (Realtime)</h2>
             <div className="controls-container theme-controls">
                {/* ... existing theme controls ... */}
                 <div className="input-group">
                    <input
                        type="text"
                        value={themePrompt}
                        onChange={(e) => setThemePrompt(e.target.value)}
                        placeholder="Enter theme description (e.g., 'dark mode', 'pastel colors')"
                        disabled={isLoadingTheme || !isRoomInitialized}
                        aria-label="Theme prompt input"
                    />
                    <button onClick={handleGenerateTheme} disabled={isLoadingTheme || !themePrompt.trim() || !isRoomInitialized} aria-live="polite">
                        {isLoadingTheme ? 'Applying Theme...' : 'Generate & Apply Theme'}
                    </button>
                </div>
            </div>
             {themeError && <p className="error-message">{themeError}</p>}
             {isLoadingTheme && (
                 <div className="loading-indicator">
                     <div className="spinner"></div>
                     <p>Generating & Applying Theme...</p>
                 </div>
             )}

            {/* --- Custom Plugins Section --- */}
            <div className="plugin-section">
                <h2>Custom Plugins</h2>
                <p className="plugin-warning">
                    <strong>Warning:</strong> Enabling custom plugins executes user-submitted JavaScript. Enable only plugins you trust, as malicious code could potentially compromise your experience or data on this page.
                </p>

                {/* Plugin Creator */}
                <h3>Create New Plugin</h3>
                <div className="plugin-creator-container">
                    <div className="plugin-form">
                        <div className="input-group">
                             <input
                                type="text"
                                value={pluginName}
                                onChange={(e) => setPluginName(e.target.value)}
                                placeholder="Plugin Name (e.g., 'Cool Button Effect')"
                                disabled={isLoadingPlugin || !isRoomInitialized}
                                aria-label="Plugin name input"
                            />
                            <textarea
                                value={pluginCode}
                                onChange={(e) => setPluginCode(e.target.value)}
                                placeholder="Enter JavaScript code here..."
                                disabled={isLoadingPlugin || !isRoomInitialized}
                                aria-label="Plugin code input"
                            />
                            <button onClick={handleCreatePlugin} disabled={isLoadingPlugin || !pluginName.trim() || !pluginCode.trim() || !isRoomInitialized}>
                                {isLoadingPlugin ? 'Testing & Saving...' : 'Create Plugin'}
                             </button>
                        </div>
                    </div>
                     {pluginError && <p className="error-message" style={{ whiteSpace: 'pre-wrap' }}>{pluginError}</p>}
                     {pluginSuccessMessage && <p style={{ color: 'green', marginTop: '1rem' }}>{pluginSuccessMessage}</p>}
                </div>

                {/* Plugin List */}
                <h3>Available Plugins</h3>
                 <div className="plugin-list-container">
                    {isPluginListLoading && <p>Loading plugins...</p>}
                     {!isRoomInitialized && <p className="error-message">Plugin list requires connection.</p>}
                     {isRoomInitialized && !isPluginListLoading && allPlugins.length === 0 && <p>No custom plugins created yet.</p>}
                     {isRoomInitialized && !isPluginListLoading && allPlugins.length > 0 && (
                        <ul className="plugin-list">
                            {allPlugins.map((plugin) => (
                                <li key={plugin.id} className="plugin-item">
                                    <div className="plugin-item-info">
                                        <strong className="plugin-name">{plugin.name}</strong>
                                         <span className="plugin-creator">
                                            <img
                                                src={getAvatarUrl(plugin.username)}
                                                alt={`${plugin.username}'s avatar`}
                                                className="avatar"
                                                 onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                             by {plugin.username}
                                        </span>
                                        {/* Maybe show a snippet of the code or description later */}
                                    </div>
                                     <div className="plugin-controls">
                                         {currentUser?.username === plugin.username && (
                                             <button
                                                 className="delete-button"
                                                 onClick={() => handleDeletePlugin(plugin.id)}
                                                 title="Delete Plugin"
                                                 disabled={!isRoomInitialized}
                                             >
                                                 Delete
                                             </button>
                                         )}
                                         <label className="toggle-switch" title={enabledPluginIds.has(plugin.id) ? 'Disable Plugin' : 'Enable Plugin'}>
                                            <input
                                                type="checkbox"
                                                checked={enabledPluginIds.has(plugin.id)}
                                                onChange={() => handleTogglePlugin(plugin.id)}
                                             />
                                            <span className="slider"></span>
                                         </label>
                                     </div>
                                </li>
                             ))}
                         </ul>
                    )}
                 </div>
            </div>


            {/* --- Gallery Section (Existing) --- */}
            <div className="gallery-section">
                <h2>Image Gallery (Realtime)</h2>
                {/* ... existing gallery rendering ... */}
                 {isGalleryLoading && <p>Loading gallery...</p>}
                {!isRoomInitialized && <p className="error-message">Gallery requires connection.</p>}
                {isRoomInitialized && !isGalleryLoading && galleryImages.length === 0 && <p>No images generated yet. Create one!</p>}
                {isRoomInitialized && !isGalleryLoading && galleryImages.length > 0 && (
                    <div className="gallery-grid">
                        {galleryImages.map((imgRecord) => (
                            <div key={imgRecord.id} className="gallery-item">
                                <img src={imgRecord.imageUrl} alt={`Generated image for: ${imgRecord.prompt}`} loading="lazy" />
                                <div className="gallery-item-info">
                                    <img
                                        src={getAvatarUrl(imgRecord.username)}
                                        alt={`${imgRecord.username}'s avatar`}
                                        className="avatar"
                                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.marginLeft = '0'; }} // Hide if avatar fails & adjust margin
                                    />
                                    <span className="username">{imgRecord.username}</span>
                                    <p className="prompt-preview" title={imgRecord.prompt}>"{imgRecord.prompt}"</p>
                                    <span className="details">{imgRecord.aspectRatio}</span>
                                    <span className="details">{new Date(imgRecord.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Mount React App ---
const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App));
} else {
    console.error("Failed to find the root element");
}