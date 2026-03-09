import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox
import json
import os

# ===== Editor grid (coarse) =====
# 48x64 grid corresponds to 240x320 if BLOCK=5
COLS, ROWS = 48, 64
BLOCK = 5  # expansion factor (each editor cell becomes 5x5 pixels)

# ===== Face region (what Arduino expects above the white line) =====
# Old "custom face" region is 240x135 (like your earlier face designer)
FACE_W = 240
FACE_H = 135

# How many editor rows map into FACE_H when expanded by BLOCK
FACE_ROWS = FACE_H // BLOCK   # 135/5 = 27 rows
# How many editor cols map into FACE_W when expanded by BLOCK
FACE_COLS = FACE_W // BLOCK   # 240/5 = 48 cols (matches COLS)

# ===== UI sizing (keep your original look) =====
PIXEL_SIZE = 12
OFFSET = 40

CELL_EMPTY = "#000000"
DEFAULT_PALETTE = [
    "#000000", "#FFFFFF", "#FF0000", "#00FF00",
    "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"
]


class AnimatedPixelArtCreator:
    def __init__(self, root):
        self.root = root
        self.root.title("TFT_eSPI Animation Designer")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.frames = [[[CELL_EMPTY for _ in range(COLS)] for _ in range(ROWS)]]
        self.current_frame_idx = 0

        self.palette_colors = DEFAULT_PALETTE[:]
        self.selected_color = "#FFFFFF"
        self.anim_speed = tk.IntVar(value=150)

        self.show_grid = tk.BooleanVar(value=True)
        self.show_numbers = tk.BooleanVar(value=True)
        self.show_center = tk.BooleanVar(value=True)

        self.palette_widgets = []  # Track widgets to update colors dynamically

        self.setup_ui()
        self.init_grid()
        self.update_frame_view()
        self.start_live_preview()

    def setup_ui(self):
        self.top_bar = tk.Frame(self.root, bg="#1c2833")
        self.top_bar.pack(side=tk.TOP, fill=tk.X)

        tk.Label(
            self.top_bar,
            text=" PROJECT MANAGEMENT",
            fg="white",
            bg="#1c2833",
            font=("Arial", 9, "bold")
        ).pack(side=tk.LEFT, padx=10)

        tk.Button(
            self.top_bar,
            text="SAVE PROJECT",
            command=self.save_project,
            bg="#f39c12",
            fg="black",
            font=("Arial", 8, "bold"),
            width=15
        ).pack(side=tk.RIGHT, padx=5, pady=5)

        tk.Button(
            self.top_bar,
            text="LOAD PROJECT",
            command=self.load_project,
            bg="#3498db",
            fg="black",
            font=("Arial", 8, "bold"),
            width=15
        ).pack(side=tk.RIGHT, padx=5, pady=5)

        self.main_frame = tk.Frame(self.root)
        self.main_frame.pack(padx=10, pady=10)

        self.canvas = tk.Canvas(
            self.main_frame,
            width=COLS * PIXEL_SIZE + OFFSET + 20,
            height=ROWS * PIXEL_SIZE + OFFSET + 20,
            bg="#1a1a1a",
            highlightthickness=0
        )
        self.canvas.pack(side=tk.LEFT)
        self.canvas.bind("<B1-Motion>", self.paint)
        self.canvas.bind("<Button-1>", self.paint)
        self.canvas.bind("<Button-3>", self.erase)

        self.sidebar = tk.Frame(self.main_frame, padx=15)
        self.sidebar.pack(side=tk.RIGHT, fill=tk.Y)

        # --- LIVE PREVIEW ---
        tk.Label(self.sidebar, text="LIVE PREVIEW", font=("Arial", 9, "bold")).pack(pady=(0, 5))
        self.preview_canvas = tk.Canvas(
            self.sidebar,
            width=COLS * 2,
            height=ROWS * 2,
            bg="black",
            highlightthickness=1,
            highlightbackground="white"
        )
        self.preview_canvas.pack(pady=5)

        # --- View Options ---
        tk.Label(self.sidebar, text="VIEW SETTINGS", font=("Arial", 9, "bold")).pack(pady=(10, 2))
        tk.Checkbutton(self.sidebar, text="Show Grid", variable=self.show_grid, command=self.refresh_canvas_style).pack(anchor="w")
        tk.Checkbutton(self.sidebar, text="Show Numbers", variable=self.show_numbers, command=self.refresh_canvas_style).pack(anchor="w")
        tk.Checkbutton(self.sidebar, text="Center Lines", variable=self.show_center, command=self.refresh_canvas_style).pack(anchor="w")

        # --- Speed ---
        tk.Label(self.sidebar, text="SPEED (ms delay)", font=("Arial", 9, "bold")).pack(pady=(10, 0))
        tk.Scale(self.sidebar, from_=50, to=1000, orient=tk.HORIZONTAL, variable=self.anim_speed).pack(fill=tk.X)

        # --- Navigation ---
        self.frame_label = tk.Label(self.sidebar, text="Frame: 1 / 1", font=("Arial", 10, "bold"))
        self.frame_label.pack(pady=10)

        nav_frame = tk.Frame(self.sidebar)
        nav_frame.pack()
        tk.Button(nav_frame, text="◀ PREV", command=self.prev_frame, width=8, fg="black", bg="#bdc3c7").pack(side=tk.LEFT, padx=2)
        tk.Button(nav_frame, text="NEXT ▶", command=self.next_frame, width=8, fg="black", bg="#bdc3c7").pack(side=tk.LEFT, padx=2)

        tk.Label(self.sidebar, text="Clone from Frame #:", font=("Arial", 8)).pack(pady=(10, 0))
        clone_row = tk.Frame(self.sidebar)
        clone_row.pack()
        self.clone_idx_var = tk.StringVar(value="1")
        tk.Entry(clone_row, textvariable=self.clone_idx_var, width=5).pack(side=tk.LEFT)
        tk.Button(clone_row, text="CLONE", command=self.clone_specific_frame, bg="#95a5a6", fg="black", font=("Arial", 8, "bold")).pack(side=tk.LEFT, padx=2)

        tk.Button(
            self.sidebar,
            text="DELETE CURRENT",
            command=self.delete_frame,
            fg="black",
            bg="#95a5a6",
            font=("Arial", 8, "bold")
        ).pack(fill=tk.X, pady=10)

        # --- Palette Section ---
        tk.Label(self.sidebar, text="PALETTE", font=("Arial", 9, "bold")).pack(pady=(10, 0))
        tk.Label(self.sidebar, text="Right-Click to change colour", font=("Arial", 7, "italic"), fg="gray").pack(pady=(0, 5))

        self.active_indicator = tk.Canvas(self.sidebar, width=60, height=20, bg=self.selected_color, highlightthickness=1)
        self.active_indicator.pack(pady=5)

        for i in range(8):
            p = tk.Canvas(self.sidebar, width=100, height=20, bg=self.palette_colors[i], highlightthickness=1)
            p.bind("<Button-1>", lambda e, idx=i: self.select_color(idx))
            p.bind("<Button-3>", lambda e, idx=i: self.open_color_wheel(idx))
            p.pack(pady=1)
            self.palette_widgets.append(p)

        tk.Button(
            self.sidebar,
            text="EXPORT FACE .H",
            command=self.export_to_file,
            bg="#2ecc71",
            fg="black",
            font=("Arial", 10, "bold"),
            height=2
        ).pack(side=tk.BOTTOM, fill=tk.X, pady=10)

    def open_color_wheel(self, idx):
        color = colorchooser.askcolor(title="Choose Palette Colour", initialcolor=self.palette_colors[idx])
        if color[1]:
            self.palette_colors[idx] = color[1]
            self.palette_widgets[idx].config(bg=color[1])
            self.select_color(idx)

    def select_color(self, idx):
        self.selected_color = self.palette_colors[idx]
        self.active_indicator.config(bg=self.selected_color)

    def start_live_preview(self):
        self.preview_frame_idx = 0
        self.animate_preview()

    def animate_preview(self):
        self.preview_canvas.delete("all")
        if self.frames:
            if self.preview_frame_idx >= len(self.frames):
                self.preview_frame_idx = 0

            f = self.frames[self.preview_frame_idx]
            for r in range(ROWS):
                for c in range(COLS):
                    if f[r][c] != CELL_EMPTY:
                        self.preview_canvas.create_rectangle(
                            c * 2, r * 2, c * 2 + 2, r * 2 + 2,
                            fill=f[r][c], outline=""
                        )

            self.preview_frame_idx = (self.preview_frame_idx + 1) % len(self.frames)

        self.root.after(self.anim_speed.get(), self.animate_preview)

    def init_grid(self):
        self.rects = [[None for _ in range(COLS)] for _ in range(ROWS)]
        self.texts = []

        for r in range(ROWS):
            if (r + 1) % 4 == 0:
                y_pos = (r * PIXEL_SIZE) + OFFSET + (PIXEL_SIZE / 2) + 6
                t = self.canvas.create_text(OFFSET - 12, y_pos, text=str(r + 1), fill="#888888", font=("Arial", 8))
                self.texts.append(t)

            for c in range(COLS):
                if r == 0 and (c + 1) % 4 == 0:
                    x_pos = (c * PIXEL_SIZE) + OFFSET + (PIXEL_SIZE / 2) + 6
                    t_col = self.canvas.create_text(x_pos, OFFSET - 12, text=str(c + 1), fill="#888888", font=("Arial", 8))
                    self.texts.append(t_col)

                x1, y1 = c * PIXEL_SIZE + OFFSET, r * PIXEL_SIZE + OFFSET
                self.rects[r][c] = self.canvas.create_rectangle(
                    x1, y1, x1 + PIXEL_SIZE, y1 + PIXEL_SIZE,
                    fill=CELL_EMPTY, outline="#222222"
                )

        # --- Center lines (optional guides) ---
        mid_x = (COLS // 2) * PIXEL_SIZE + OFFSET
        mid_y = (ROWS // 2) * PIXEL_SIZE + OFFSET
        self.center_lines = [
            self.canvas.create_line(mid_x, 5, mid_x, ROWS * PIXEL_SIZE + OFFSET + 5, fill="#e74c3c", dash=(4, 4), width=1),
            self.canvas.create_line(5, mid_y, COLS * PIXEL_SIZE + OFFSET + 5, mid_y, fill="#e74c3c", dash=(4, 4), width=1)
        ]

        # --- FACE REGION BOUNDARY LINE (THIS IS THE IMPORTANT PART) ---
        # This shows exactly what will be exported as the custom face (top 240x135 region)
        boundary_y = OFFSET + FACE_ROWS * PIXEL_SIZE
        self.face_boundary = self.canvas.create_line(
            OFFSET, boundary_y,
            OFFSET + COLS * PIXEL_SIZE, boundary_y,
            fill="white", width=2
        )

        self.refresh_canvas_style()

    def refresh_canvas_style(self):
        outline_color = "#222222" if self.show_grid.get() else ""
        for r in range(ROWS):
            for c in range(COLS):
                self.canvas.itemconfig(self.rects[r][c], outline=outline_color)

        text_state = "normal" if self.show_numbers.get() else "hidden"
        for t_id in self.texts:
            self.canvas.itemconfig(t_id, state=text_state)

        center_state = "normal" if self.show_center.get() else "hidden"
        for l_id in self.center_lines:
            self.canvas.itemconfig(l_id, state=center_state)

        # boundary line should always show (so you don't accidentally draw below it)
        self.canvas.itemconfig(self.face_boundary, state="normal")

    def paint(self, event):
        c, r = (event.x - OFFSET) // PIXEL_SIZE, (event.y - OFFSET) // PIXEL_SIZE
        if 0 <= r < ROWS and 0 <= c < COLS:
            self.frames[self.current_frame_idx][r][c] = self.selected_color
            self.canvas.itemconfig(self.rects[r][c], fill=self.selected_color)

    def erase(self, event):
        c, r = (event.x - OFFSET) // PIXEL_SIZE, (event.y - OFFSET) // PIXEL_SIZE
        if 0 <= r < ROWS and 0 <= c < COLS:
            self.frames[self.current_frame_idx][r][c] = CELL_EMPTY
            self.canvas.itemconfig(self.rects[r][c], fill=CELL_EMPTY)

    def update_frame_view(self):
        self.frame_label.config(text=f"Frame: {self.current_frame_idx + 1} / {len(self.frames)}")
        current_data = self.frames[self.current_frame_idx]
        for r in range(ROWS):
            for c in range(COLS):
                self.canvas.itemconfig(self.rects[r][c], fill=current_data[r][c])

    def next_frame(self):
        if self.current_frame_idx < len(self.frames) - 1:
            self.current_frame_idx += 1
        else:
            self.frames.append([[CELL_EMPTY for _ in range(COLS)] for _ in range(ROWS)])
            self.current_frame_idx += 1
        self.update_frame_view()

    def prev_frame(self):
        if self.current_frame_idx > 0:
            self.current_frame_idx -= 1
            self.update_frame_view()

    def clone_specific_frame(self):
        try:
            source_idx = int(self.clone_idx_var.get()) - 1
            if 0 <= source_idx < len(self.frames):
                new_frame = [row[:] for row in self.frames[source_idx]]
                self.frames.insert(self.current_frame_idx + 1, new_frame)
                self.current_frame_idx += 1
                self.update_frame_view()
        except:
            pass

    def delete_frame(self):
        if len(self.frames) > 1:
            self.frames.pop(self.current_frame_idx)
            self.current_frame_idx = min(self.current_frame_idx, len(self.frames) - 1)
            self.update_frame_view()

    def on_closing(self):
        if messagebox.askyesno("Confirm Exit", "Save project before closing?"):
            self.save_project()
        self.root.destroy()

    def save_project(self):
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("Project File", "*.json")])
        if path:
            with open(path, "w") as f:
                json.dump({"frames": self.frames, "palette": self.palette_colors, "speed": self.anim_speed.get()}, f)

    def load_project(self):
        path = filedialog.askopenfilename(filetypes=[("Project File", "*.json")])
        if not path:
            return

        with open(path, "r") as f:
            data = json.load(f)

        self.frames = data.get("frames", self.frames)

        loaded_palette = data.get("palette", self.palette_colors)
        if len(loaded_palette) < 8:
            loaded_palette = loaded_palette + DEFAULT_PALETTE[len(loaded_palette):]
        elif len(loaded_palette) > 8:
            loaded_palette = loaded_palette[:8]
        self.palette_colors = loaded_palette

        if "speed" in data:
            self.anim_speed.set(data["speed"])

        for i, color in enumerate(self.palette_colors):
            self.palette_widgets[i].config(bg=color)

        self.current_frame_idx = 0
        self.update_frame_view()

    # ===== Export: custom face header (240x135) contained above the white line =====
    def export_to_file(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".h",
            filetypes=[("Arduino Header", "*.h")],
            initialfile="face.h"
        )
        if not path:
            return

        fr = self.frames[self.current_frame_idx]

        # Expand ONLY the top FACE_ROWS rows into a 240x135 bitmap
        pixels = []
        for r in range(FACE_ROWS):  # <-- KEY FIX: only export rows above the boundary line
            for _ in range(BLOCK):
                for c in range(FACE_COLS):  # should be 48
                    v = self.rgb_to_565(fr[r][c])
                    pixels.extend([v] * BLOCK)

        expected = FACE_W * FACE_H
        if len(pixels) != expected:
            messagebox.showerror("Export Error", f"Pixel count mismatch: got {len(pixels)}, expected {expected}.")
            return

        with open(path, "w") as f:
            f.write("// Auto-generated custom face header\n")
            f.write("#pragma once\n")
            f.write("#include <Arduino.h>\n\n")
            f.write(f"#define FACE_W {FACE_W}\n")
            f.write(f"#define FACE_H {FACE_H}\n\n")

            # Keep EXACT naming expected by the old Arduino custom-face program
            f.write("static const uint16_t face_bitmap[FACE_W * FACE_H] PROGMEM = {\n")

            per_line = 12
            for i, val in enumerate(pixels):
                if i % per_line == 0:
                    f.write("  ")
                f.write(f"0x{val:04X}, ")
                if i % per_line == per_line - 1:
                    f.write("\n")
            if len(pixels) % per_line != 0:
                f.write("\n")

            f.write("};\n")

        messagebox.showinfo(
            "Export",
            f"Saved {path}\nExported Frame {self.current_frame_idx + 1}\n(face region: top {FACE_H}px)"
        )

    def rgb_to_565(self, hex_color):
        h = hex_color.lstrip('#')
        r, g, b = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
        return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


if __name__ == "__main__":
    root = tk.Tk()
    app = AnimatedPixelArtCreator(root)
    root.mainloop()
