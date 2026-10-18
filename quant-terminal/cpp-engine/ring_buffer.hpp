#pragma once

#include <atomic>
#include <cstddef>
#include <new>

namespace alphaforge {

// Lock-free Single-Producer Single-Consumer (SPSC) Ring Buffer
// Zero-allocation, hardware memory fences, cache-line separated head and tail
template <typename T, size_t Capacity = 65536>
class alignas(64) SPSCRingBuffer {
    static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of 2");

private:
    alignas(64) T buffer_[Capacity];
    
    // Separate head and tail onto different 64-byte cache lines to eliminate False Sharing
    alignas(64) std::atomic<size_t> tail_{0}; // Producer writes here
    alignas(64) std::atomic<size_t> head_{0}; // Consumer reads here

    static constexpr size_t IndexMask = Capacity - 1;

public:
    SPSCRingBuffer() = default;
    ~SPSCRingBuffer() = default;

    // Push by producer with memory_order_release
    inline bool push(const T& item) noexcept {
        const size_t current_tail = tail_.load(std::memory_order_relaxed);
        const size_t current_head = head_.load(std::memory_order_acquire);

        if ((current_tail - current_head) >= Capacity) {
            return false; // Buffer full
        }

        buffer_[current_tail & IndexMask] = item;
        tail_.store(current_tail + 1, std::memory_order_release);
        return true;
    }

    // Pop by consumer with memory_order_release
    inline bool pop(T& item) noexcept {
        const size_t current_head = head_.load(std::memory_order_relaxed);
        const size_t current_tail = tail_.load(std::memory_order_acquire);

        if (current_head == current_tail) {
            return false; // Buffer empty
        }

        item = buffer_[current_head & IndexMask];
        head_.store(current_head + 1, std::memory_order_release);
        return true;
    }

    inline size_t size() const noexcept {
        const size_t current_head = head_.load(std::memory_order_relaxed);
        const size_t current_tail = tail_.load(std::memory_order_relaxed);
        return (current_tail >= current_head) ? (current_tail - current_head) : 0;
    }

    inline bool empty() const noexcept {
        return head_.load(std::memory_order_relaxed) == tail_.load(std::memory_order_relaxed);
    }
};

} // namespace alphaforge
