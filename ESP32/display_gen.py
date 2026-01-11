import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox

# Face region
FACE_W, FACE_H = 240, 135
BLOCK = 3  # 80x45 grid

COLS = FACE_W // BLOCK
ROWS = FACE_H // BLOCK

OFFSET = 30  # room for labels

BG_COLOR = "#1a1a1a"
CELL_OUTLINE = "#AAAAAA"   # VERY visible
CELL_EMPTY = "#000000"

def rgb_to_565(hex_color: str) -> int:
    h = hex_color.lstrip('#')
    r, g, b = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)

class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title(f"Face Designer {FACE_W}x{FACE_H} (block={BLOCK})")

        # Auto pixel size so it fits nicely
        # 80 cols wide -> at 10px it's 800px plus offsets
        self.PIXEL = 10

        self.palette = ["#000000", "#FFFFFF", "#FF0000", "#00FF00",
                        "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]
        self.color = "#FFFFFF"

        self.grid = [[CELL_EMPTY for _ in range(COLS)] for _ in range(ROWS)]

        # Layout
        main = tk.Frame(root)
        main.pack(padx=12, pady=12)

        # Canvas size EXACTLY to content (no scrolling)
        cw = OFFSET + COLS * self.PIXEL + 10
        ch = OFFSET + ROWS * self.PIXEL + 10

        self.canvas = tk.Canvas(main, width=cw, height=ch, bg=BG_COLOR, highlightthickness=0)
        self.canvas.pack(side=tk.LEFT)

        side = tk.Frame(main, padx=14)
        side.pack(side=tk.RIGHT, fill=tk.Y)

        tk.Label(side, text=f"Grid: {COLS} x {ROWS}\nExport: {FACE_W}x{FACE_H}",
                 fg="dodgerblue", justify=tk.LEFT, font=("Arial", 9, "bold")).pack(pady=8)

        tk.Label(side, text="ACTIVE COLOR").pack()
        self.active = tk.Canvas(side, width=60, height=30, bg=self.color, highlightthickness=1)
        self.active.pack(pady=6)

        tk.Label(side, text="PALETTE").pack(pady=6)
        for i, col in enumerate(self.palette):
            sw = tk.Canvas(side, width=80, height=26, bg=col, highlightthickness=1)
            sw.pack(pady=2)
            sw.bind("<Button-1>", lambda e, idx=i: self.pick(idx))
            sw.bind("<Button-3>", lambda e, idx=i: self.edit(idx))

        tk.Button(side, text="CLEAR", fg="red", command=self.clear).pack(pady=10)
        tk.Button(side, text="EXPORT face.h", bg="#2ecc71", fg="white",
                  height=2, command=self.export).pack(side=tk.BOTTOM, pady=12)

        # Draw grid + a BIG red border so you KNOW it's drawn
        self.rects = [[None for _ in range(COLS)] for _ in range(ROWS)]
        self.draw_grid()

        # Bind paint
        self.canvas.bind("<Button-1>", self.paint)
        self.canvas.bind("<B1-Motion>", self.paint)

    def draw_grid(self):
        # Bright red border around drawable region (guaranteed visible)
        x0, y0 = OFFSET, OFFSET
        x1 = OFFSET + COLS * self.PIXEL
        y1 = OFFSET + ROWS * self.PIXEL
        self.canvas.create_rectangle(x0, y0, x1, y1, outline="red", width=2)

        # Labels
        for r in range(0, ROWS, 5):
            self.canvas.create_text(12, OFFSET + r * self.PIXEL + self.PIXEL // 2,
                                    text=str(r), fill="white", font=("Arial", 8))
        for c in range(0, COLS, 5):
            self.canvas.create_text(OFFSET + c * self.PIXEL + self.PIXEL // 2, 12,
                                    text=str(c), fill="white", font=("Arial", 8))

        # Cells
        for r in range(ROWS):
            for c in range(COLS):
                x1 = OFFSET + c * self.PIXEL
                y1 = OFFSET + r * self.PIXEL
                x2 = x1 + self.PIXEL
                y2 = y1 + self.PIXEL
                self.rects[r][c] = self.canvas.create_rectangle(
                    x1, y1, x2, y2, fill=CELL_EMPTY, outline=CELL_OUTLINE
                )

    def pick(self, idx: int):
        self.color = self.palette[idx]
        self.active.config(bg=self.color)

    def edit(self, idx: int):
        data = colorchooser.askcolor(initialcolor=self.palette[idx])
        if data[1]:
            self.palette[idx] = data[1]
            # (Not updating swatch widget here; keeping minimal)
            self.pick(idx)

    def paint(self, event):
        c = (event.x - OFFSET) // self.PIXEL
        r = (event.y - OFFSET) // self.PIXEL
        if 0 <= r < ROWS and 0 <= c < COLS:
            self.grid[r][c] = self.color
            self.canvas.itemconfig(self.rects[r][c], fill=self.color)

    def clear(self):
        for r in range(ROWS):
            for c in range(COLS):
                self.grid[r][c] = CELL_EMPTY
                self.canvas.itemconfig(self.rects[r][c], fill=CELL_EMPTY)

    def export(self):
        path = filedialog.asksaveasfilename(defaultextension=".h",
                                            filetypes=[("Header file", "*.h")],
                                            initialfile="face.h")
        if not path:
            return

        # Expand coarse grid into full 240x135 RGB565
        pixels = []
        for r in range(ROWS):
            for _ in range(BLOCK):
                for c in range(COLS):
                    v = rgb_to_565(self.grid[r][c])
                    pixels.extend([v] * BLOCK)

        with open(path, "w") as f:
            f.write("// Auto-generated face.h\n")
            f.write("#pragma once\n")
            f.write("#include <Arduino.h>\n\n")
            f.write(f"#define FACE_W {FACE_W}\n")
            f.write(f"#define FACE_H {FACE_H}\n\n")
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

        messagebox.showinfo("Export", f"Saved {path}")

if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
