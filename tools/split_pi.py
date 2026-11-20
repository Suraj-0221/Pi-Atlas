import os

def split_pi():
    input_path = os.path.join('public', 'pi_10m.bin')
    chunk_size = 500_000 # 500 KB per chunk for 10 chunks = 5,000,000 bytes
    
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Missing {input_path}")
        
    with open(input_path, 'rb') as f:
        data = f.read()
        
    total_bytes = len(data)
    print(f"Read {total_bytes} bytes from {input_path}")
    
    num_chunks = 10
    for i in range(num_chunks):
        start = i * chunk_size
        end = start + chunk_size
        chunk = data[start:end]
        filename = f"pi_{i:02d}.bin"
        out_path = os.path.join('public', filename)
        with open(out_path, 'wb') as out_f:
            out_f.write(chunk)
        print(f"Wrote {len(chunk)} bytes to {out_path}")
        
    print("Successfully split pi_10m.bin into 10 chunks (pi_00.bin to pi_09.bin)!")

if __name__ == '__main__':
    split_pi()
