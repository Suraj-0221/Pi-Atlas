#!/usr/bin/env python3
"""
tools/gen_pi.py
Generates the first N (default 10,000,000) digits of pi after the decimal point
using gmpy2 (or fallback to pure python Chudnovsky),
verifies the first 50 digits against reference:
  14159265358979323846264338327950288419716939937510
and packs 2 digits per byte (4-bit BCD) into public/pi_10m.bin (~5.00 MB).
"""

import sys
import os
import math
import time
import argparse

KNOWN_FIRST_50 = "14159265358979323846264338327950288419716939937510"

def compute_pi_gmpy2(num_digits: int) -> str:
    from gmpy2 import mpz, isqrt
    C = mpz(640320)
    C3_OVER_24 = C**3 // 24
    DIGITS_PER_TERM = 14.181647462725477
    N = int(num_digits / DIGITS_PER_TERM) + 1

    print(f"[*] gmpy2: Generating {num_digits:,} digits ({N:,} terms)...", flush=True)

    def bs(a, b):
        if b - a == 1:
            if a == 0:
                P = mpz(1)
                Q = mpz(1)
            else:
                a_z = mpz(a)
                P = (6*a_z - 5) * (2*a_z - 1) * (6*a_z - 1)
                Q = a_z**3 * C3_OVER_24
            T = P * (13591409 + 545140134 * a)
            if a & 1:
                T = -T
            return P, Q, T
        else:
            m = (a + b) // 2
            P1, Q1, T1 = bs(a, m)
            P2, Q2, T2 = bs(m, b)
            return P1 * P2, Q1 * Q2, T1 * Q2 + P1 * T2

    t0 = time.time()
    P, Q, T = bs(0, N)
    print(f"[1/4] Binary split recursion: {time.time() - t0:.2f}s", flush=True)

    t1 = time.time()
    prec = num_digits + 20
    target = mpz(10005) * mpz(10)**(2 * prec)
    x = isqrt(target)
    print(f"[2/4] Integer isqrt: {time.time() - t1:.2f}s", flush=True)

    t2 = time.time()
    val = (426880 * x * Q) // T
    print(f"[3/4] High-precision division: {time.time() - t2:.2f}s", flush=True)

    t3 = time.time()
    s = str(val)
    print(f"[4/4] Decimal string conversion: {time.time() - t3:.2f}s", flush=True)

    if not s.startswith("3"):
        raise ValueError(f"Unexpected prefix in pi calculation: {s[:10]}")

    digits = s[1:num_digits + 1]
    print(f"[+] Total calculation time: {time.time() - t0:.2f}s", flush=True)
    return digits


def compute_pi_fallback(num_digits: int) -> str:
    sys.set_int_max_str_digits(0)
    C = 640320
    C3_OVER_24 = C**3 // 24
    DIGITS_PER_TERM = 14.181647462725477
    N = int(num_digits / DIGITS_PER_TERM) + 1

    print(f"[*] Pure Python: Generating {num_digits:,} digits...", flush=True)

    def bs(a, b):
        if b - a == 1:
            if a == 0:
                P = 1
                Q = 1
            else:
                P = (6*a - 5) * (2*a - 1) * (6*a - 1)
                Q = a**3 * C3_OVER_24
            T = P * (13591409 + 545140134 * a)
            if a & 1:
                T = -T
            return P, Q, T
        else:
            m = (a + b) // 2
            P1, Q1, T1 = bs(a, m)
            P2, Q2, T2 = bs(m, b)
            return P1 * P2, Q1 * Q2, T1 * Q2 + P1 * T2

    t0 = time.time()
    P, Q, T = bs(0, N)
    prec = num_digits + 20
    target = 10005 * 10**(2 * prec)
    x = math.isqrt(target)
    val = (426880 * x * Q) // T
    s = str(val)
    if not s.startswith("3"):
        raise ValueError(f"Unexpected prefix: {s[:10]}")
    digits = s[1:num_digits + 1]
    print(f"[+] Pure Python calculation done in {time.time() - t0:.2f}s", flush=True)
    return digits


def verify_digits(digits: str):
    first_50 = digits[:50]
    print("[*] Verifying first 50 digits against reference...", flush=True)
    print(f"    Expected: {KNOWN_FIRST_50}", flush=True)
    print(f"    Computed: {first_50}", flush=True)
    if first_50 != KNOWN_FIRST_50:
        raise ValueError(f"VERIFICATION FAILURE: Computed first 50 digits do not match reference!\nGot: {first_50}")
    print("    [PASS] Verification successful: exact match with known mathematical constant.", flush=True)


def pack_bcd(digits: str) -> bytes:
    n = len(digits)
    if n % 2 != 0:
        digits += "0"
        n += 1
    out = bytearray(n // 2)
    for i in range(0, n, 2):
        d1 = ord(digits[i]) - 48
        d2 = ord(digits[i + 1]) - 48
        out[i // 2] = (d1 << 4) | d2
    return bytes(out)


def main():
    parser = argparse.ArgumentParser(description="Generate and BCD-pack pi digits")
    parser.add_argument("--digits", type=int, default=10_000_000, help="Number of digits to generate (default: 10,000,000)")
    parser.add_argument("--out", type=str, default="public/pi_10m.bin", help="Output bin path")
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    try:
        import gmpy2
        digits = compute_pi_gmpy2(args.digits)
    except ImportError:
        print("[!] gmpy2 not found, using pure python binary-splitting...", flush=True)
        digits = compute_pi_fallback(args.digits)

    verify_digits(digits)

    print(f"[*] Packing {len(digits):,} digits into 4-bit BCD...", flush=True)
    t0 = time.time()
    packed = pack_bcd(digits)
    print(f"    Packed into {len(packed):,} bytes ({len(packed) / (1024*1024):.2f} MB) in {time.time() - t0:.2f}s", flush=True)

    print(f"[*] Writing binary to {args.out}...", flush=True)
    with open(args.out, "wb") as f:
        f.write(packed)

    print(f"[SUCCESS] {args.out} created ({os.path.getsize(args.out):,} bytes).", flush=True)


if __name__ == "__main__":
    main()
